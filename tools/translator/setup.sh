#!/usr/bin/env bash
# One-time setup of the local translator (run as the "deploy" user).
#
#   bash tools/translator/setup.sh            # M2M100 418M (MIT licence, ~0.5 GB RAM)
#   bash tools/translator/setup.sh 1.2B       # M2M100 1.2B (MIT, better, ~1.3 GB RAM)
#   bash tools/translator/setup.sh nllb       # NLLB 600M (best for Armenian, NON-COMMERCIAL licence)
#
# Running it again with another choice switches the model (pm2 restart translator).
#
# Needs: sudo apt install -y python3-venv   (once)
set -euo pipefail

CHOICE="${1:-418M}"
case "$CHOICE" in
  418M) HF_MODEL="facebook/m2m100_418M";              FAMILY="m2m100" ;;
  1.2B) HF_MODEL="facebook/m2m100_1.2B";              FAMILY="m2m100" ;;
  nllb) HF_MODEL="facebook/nllb-200-distilled-600M";  FAMILY="nllb" ;;
  *) echo "Unknown choice: $CHOICE (use 418M, 1.2B or nllb)"; exit 1 ;;
esac

BASE="$HOME/translator"
VENV="$BASE/venv"
MODEL_DIR="$BASE/$(basename "$HF_MODEL")-int8"
HERE="$(cd "$(dirname "$0")" && pwd)"

mkdir -p "$BASE"
[ -d "$VENV" ] || python3 -m venv "$VENV"
"$VENV/bin/pip" install --upgrade pip >/dev/null
"$VENV/bin/pip" install -r "$HERE/requirements.txt"

if [ ! -f "$MODEL_DIR/model.bin" ]; then
  echo "Converting $HF_MODEL (one time; downloads the model, needs ~3 GB free RAM+swap)..."
  # Conversion tools are only needed once and are removed afterwards.
  "$VENV/bin/pip" install --index-url https://download.pytorch.org/whl/cpu torch
  "$VENV/bin/pip" install "transformers[sentencepiece]" protobuf
  # Loading in float16 with low memory use halves the RAM needed, so even the
  # 1.2B model converts on a 4 GB server with swap.
  "$VENV/bin/ct2-transformers-converter" --model "$HF_MODEL" --output_dir "$MODEL_DIR" \
    --quantization int8 --copy_files sentencepiece.bpe.model \
    --low_cpu_mem_usage --load_as_float16
  "$VENV/bin/pip" uninstall -y torch transformers >/dev/null || true
  rm -rf "$HOME/.cache/huggingface"
fi

cat > "$BASE/env" <<EOF
TRANSLATOR_MODEL_DIR=$MODEL_DIR
TRANSLATOR_FAMILY=$FAMILY
TRANSLATOR_THREADS=2
EOF

echo
echo "Done. Model: $MODEL_DIR ($FAMILY)"
echo "Start it with:"
echo "  pm2 start $HERE/start.sh --name translator && pm2 save"
