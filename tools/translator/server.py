"""Local translation service for the Flexit AI assistant.

Runs a CTranslate2 model (M2M100 or NLLB) on the CPU and listens on
127.0.0.1 only, so texts never leave the server.

    POST /translate  {"texts": ["..."], "source": "ru", "target": "hy"}
                  -> {"translations": ["..."]}
    GET  /health  -> {"status": "ok", "model": "...", "family": "..."}

Settings (environment variables):
    TRANSLATOR_MODEL_DIR   converted model folder (has model.bin and sentencepiece.bpe.model)
    TRANSLATOR_FAMILY      "m2m100" (default, MIT licence) or "nllb" (CC-BY-NC, non-commercial)
    TRANSLATOR_HOST/PORT   default 127.0.0.1:8765
    TRANSLATOR_THREADS     CPU threads used per translation (default 2)
"""

import json
import os
import re
import sys
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

import ctranslate2
import sentencepiece as spm

MODEL_DIR = os.environ.get("TRANSLATOR_MODEL_DIR", os.path.expanduser("~/translator/model"))
FAMILY = os.environ.get("TRANSLATOR_FAMILY", "m2m100").lower()
HOST = os.environ.get("TRANSLATOR_HOST", "127.0.0.1")
PORT = int(os.environ.get("TRANSLATOR_PORT", "8765"))
THREADS = int(os.environ.get("TRANSLATOR_THREADS", "2"))

# Sentences longer than this many tokens are cut, the models handle up to ~512.
MAX_TOKENS = 400
BATCH_SIZE = 16

# Short language codes used by Laravel -> model specific language tokens.
LANG_TOKENS = {
    "m2m100": {"ru": "__ru__", "hy": "__hy__", "en": "__en__"},
    "nllb": {"ru": "rus_Cyrl", "hy": "hye_Armn", "en": "eng_Latn"},
}

if FAMILY not in LANG_TOKENS:
    sys.exit(f"Unknown TRANSLATOR_FAMILY={FAMILY!r}, use m2m100 or nllb")

translator = ctranslate2.Translator(
    MODEL_DIR, device="cpu", compute_type="int8", inter_threads=1, intra_threads=THREADS
)
tokenizer = spm.SentencePieceProcessor(model_file=os.path.join(MODEL_DIR, "sentencepiece.bpe.model"))

SENTENCE_END = re.compile(r"(?<=[.!?:;])\s+")
LETTER = re.compile(r"[^\W\d_]", re.UNICODE)
# List markers and other decoration kept outside the text sent to the model.
DECORATION = re.compile(r"^([\s■•▪●○◦\-–—*·>]+)?(.*?)([\s:;.,]*)$", re.DOTALL)

# Small models sometimes "hallucinate" a whole unrelated sentence for a short
# or odd input; such outputs are dropped and the original is kept.
MAX_LENGTH_RATIO = 3.0
MAX_LENGTH_SLACK = 40


def split_sentences(line):
    return [s for s in SENTENCE_END.split(line.strip()) if s]


def looks_hallucinated(source, translated):
    if not translated.strip():
        return True
    if len(translated) > len(source) * MAX_LENGTH_RATIO + MAX_LENGTH_SLACK:
        return True
    # The same short piece repeated many times ("«»«»«»", "1. 1. 1.").
    return bool(re.search(r"(.{1,6})\1{4,}", translated))


def translate_sentences(sentences, source, target):
    tokens = LANG_TOKENS[FAMILY]
    src_token, tgt_token = tokens[source], tokens[target]
    out = [None] * len(sentences)

    # Only parts with letters go to the model; numbers / symbols stay as they are.
    todo = []
    for i, sentence in enumerate(sentences):
        prefix, core, suffix = DECORATION.match(sentence).groups()
        if len(LETTER.findall(core)) < 2:
            out[i] = sentence
        else:
            todo.append((i, prefix or "", core, suffix or ""))

    for start in range(0, len(todo), BATCH_SIZE):
        batch = todo[start : start + BATCH_SIZE]
        encoded = [tokenizer.encode(core, out_type=str)[:MAX_TOKENS] for _, _, core, _ in batch]
        results = translator.translate_batch(
            [[src_token] + tokens_ + ["</s>"] for tokens_ in encoded],
            target_prefix=[[tgt_token]] * len(batch),
            beam_size=3,
            # Output is limited relative to the longest input in the batch.
            max_decoding_length=min(MAX_TOKENS + 64, max(len(t) for t in encoded) * 3 + 10),
            repetition_penalty=1.2,
            no_repeat_ngram_size=4,
        )
        for (i, prefix, core, suffix), result in zip(batch, results):
            # The first token is the target language code.
            translated = tokenizer.decode(result.hypotheses[0][1:]).strip()
            if looks_hallucinated(core, translated):
                out[i] = sentences[i]
            else:
                # The model adds its own final punctuation sometimes; keep the original one.
                out[i] = prefix + (translated.rstrip(" .:;,։") if suffix.strip() else translated) + suffix
    return out


def translate_text(text, source, target):
    """Keeps line breaks: every line is split into sentences and rebuilt."""
    lines = text.split("\n")
    sentences, layout = [], []
    for line in lines:
        parts = split_sentences(line)
        layout.append(len(parts))
        sentences.extend(parts)
    translated = iter(translate_sentences(sentences, source, target)) if sentences else iter([])
    return "\n".join(" ".join(next(translated) for _ in range(count)) for count in layout)


class Handler(BaseHTTPRequestHandler):
    def _send(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            self._send(200, {"status": "ok", "model": os.path.basename(MODEL_DIR.rstrip("/")), "family": FAMILY})
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/translate":
            self._send(404, {"error": "not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            data = json.loads(self.rfile.read(length) or b"{}")
            texts = data.get("texts") or []
            source = data.get("source", "ru")
            target = data.get("target", "hy")
            if not isinstance(texts, list) or source not in LANG_TOKENS[FAMILY] or target not in LANG_TOKENS[FAMILY]:
                self._send(422, {"error": "texts must be a list; source/target one of " + ", ".join(LANG_TOKENS[FAMILY])})
                return
            started = time.time()
            translations = [translate_text(str(t), source, target) for t in texts]
            self._send(200, {"translations": translations, "seconds": round(time.time() - started, 2)})
        except Exception as error:  # report, keep serving
            self._send(500, {"error": str(error)})

    def log_message(self, fmt, *args):  # quieter logs
        sys.stderr.write("%s %s\n" % (self.address_string(), fmt % args))


if __name__ == "__main__":
    print(f"Translator ({FAMILY}, {MODEL_DIR}) on http://{HOST}:{PORT}", flush=True)
    HTTPServer((HOST, PORT), Handler).serve_forever()
