package am.flexit.terminal;

import android.content.Context;
import android.net.Uri;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import org.json.JSONObject;

/**
 * Device requests for the terminal page:
 *   FlexitAndroid.print() opens the system print dialog;
 *   FlexitAndroid.request(id, '{"url","method","headers","body","timeoutMs"}')
 * answers by calling window.__flexitAndroidDone(id, '{"status","headers","body"}'
 * or '{"error"}'). Only the terminal (https://terminal.flexit.am) may use it.
 */
public class FlexitBridge {

    private static final String TRUSTED_HOST = "terminal.flexit.am";

    private final WebView webView;

    FlexitBridge(WebView webView) {
        this.webView = webView;
    }

    @JavascriptInterface
    public void request(final String id, final String specJson) {
        // The page URL can only be read on the UI thread.
        webView.post(() -> {
            Uri page = Uri.parse(String.valueOf(webView.getUrl()));
            if (!"https".equals(page.getScheme()) || !TRUSTED_HOST.equals(page.getHost())) {
                reply(id, error("This page may not make device requests"));
                return;
            }
            new Thread(() -> reply(id, perform(specJson))).start();
        });
    }

    /**
     * FlexitAndroid.print(): the WebView ignores window.print(), so the page
     * asks for the system print dialog (printers, "Save as PDF"). The page's
     * print CSS decides what is printed (e.g. only the ՀԴՄ receipt).
     */
    @JavascriptInterface
    public void print() {
        webView.post(() -> {
            Uri page = Uri.parse(String.valueOf(webView.getUrl()));
            if (!"https".equals(page.getScheme()) || !TRUSTED_HOST.equals(page.getHost())) {
                return;
            }
            PrintManager printManager = (PrintManager) webView.getContext().getSystemService(Context.PRINT_SERVICE);
            if (printManager == null) {
                return;
            }
            String name = "Flexit";
            printManager.print(name, webView.createPrintDocumentAdapter(name), new PrintAttributes.Builder().build());
        });
    }

    private String perform(String specJson) {
        HttpURLConnection conn = null;
        try {
            JSONObject spec = new JSONObject(specJson);
            URL url = new URL(spec.getString("url"));
            String protocol = url.getProtocol();
            if (!"https".equals(protocol) && !"http".equals(protocol)) {
                return error("Not allowed: " + protocol);
            }

            int timeout = Math.min(spec.optInt("timeoutMs", 30000), 120000);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod(spec.optString("method", "GET"));
            conn.setConnectTimeout(timeout);
            conn.setReadTimeout(timeout);
            conn.setUseCaches(false);

            JSONObject headers = spec.optJSONObject("headers");
            if (headers != null) {
                Iterator<String> keys = headers.keys();
                while (keys.hasNext()) {
                    String key = keys.next();
                    conn.setRequestProperty(key, headers.getString(key));
                }
            }

            if (spec.has("body") && !spec.isNull("body")) {
                byte[] body = spec.getString("body").getBytes(StandardCharsets.UTF_8);
                conn.setDoOutput(true);
                try (OutputStream out = conn.getOutputStream()) {
                    out.write(body);
                }
            }

            int status = conn.getResponseCode();
            InputStream in = status >= 400 ? conn.getErrorStream() : conn.getInputStream();
            String text = "";
            if (in != null) {
                try (InputStream stream = in; ByteArrayOutputStream buf = new ByteArrayOutputStream()) {
                    byte[] chunk = new byte[8192];
                    int n;
                    while ((n = stream.read(chunk)) != -1) {
                        buf.write(chunk, 0, n);
                    }
                    text = buf.toString("UTF-8");
                }
            }

            JSONObject outHeaders = new JSONObject();
            for (Map.Entry<String, List<String>> h : conn.getHeaderFields().entrySet()) {
                if (h.getKey() != null && !h.getValue().isEmpty()) {
                    outHeaders.put(h.getKey().toLowerCase(), h.getValue().get(0));
                }
            }

            JSONObject result = new JSONObject();
            result.put("status", status);
            result.put("headers", outHeaders);
            result.put("body", text);
            return result.toString();
        } catch (Exception e) {
            return error(e.getClass().getSimpleName() + ": " + e.getMessage());
        } finally {
            if (conn != null) {
                conn.disconnect();
            }
        }
    }

    private static String error(String message) {
        try {
            return new JSONObject().put("error", message).toString();
        } catch (Exception e) {
            return "{\"error\":\"failed\"}";
        }
    }

    private void reply(String id, String resultJson) {
        String js = "window.__flexitAndroidDone && window.__flexitAndroidDone("
            + JSONObject.quote(id) + "," + JSONObject.quote(resultJson) + ")";
        webView.post(() -> webView.evaluateJavascript(js, null));
    }
}
