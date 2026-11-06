package am.flexit.terminal;

import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // window.FlexitAndroid: requests made by the phone itself (its own IP),
        // for the tax service and the company's 1C. See FlexitBridge.
        WebView webView = getBridge().getWebView();
        webView.addJavascriptInterface(new FlexitBridge(webView), "FlexitAndroid");
        // The interface is visible to pages loaded after it was added.
        webView.reload();
    }
}
