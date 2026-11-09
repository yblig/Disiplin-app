package com.gilbi.disiplin;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;

/** Menampilkan aplikasi web Disiplin (dari assets/www) dan menyediakan jembatan ke alarm native. */
public class MainActivity extends Activity {
    static final int FILE_REQ = 10;
    private WebView web;
    private ValueCallback<Uri[]> fileCb;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().setStatusBarColor(Color.parseColor("#EF4444"));
        AlarmService.createChannel(this);

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .addPathHandler("/thumb/", MediaServer.thumb(this))
                .addPathHandler("/media/", MediaServer.media(this))
                .addPathHandler("/wallfile/", MediaServer.wallFile(this))
                .build();

        web = new WebView(this);
        web.setHorizontalScrollBarEnabled(false);
        web.setOverScrollMode(WebView.OVER_SCROLL_NEVER);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setUseWideViewPort(true);        // pakai <meta viewport> -> lebar = lebar layar
        s.setLoadWithOverviewMode(true);
        s.setSupportZoom(false);
        // huruf HP besar tetap dihormati, tapi dibatasi supaya tampilan tidak meluber
        s.setTextZoom(Math.max(85, Math.min(s.getTextZoom(), 120)));

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                return loader.shouldInterceptRequest(req.getUrl());
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (fileCb != null) fileCb.onReceiveValue(null);
                fileCb = cb;
                try {
                    startActivityForResult(params.createIntent(), FILE_REQ);
                } catch (Exception e) {
                    fileCb = null;
                    return false;
                }
                return true;
            }
        });
        web.addJavascriptInterface(new NativeBridge(this), "DisiplinNative");
        setContentView(web);
        web.loadUrl("https://appassets.androidplatform.net/assets/www/index.html");

        AlarmScheduler.scheduleAll(this);
        handleShare(getIntent(), false);
    }

    private String pendingShared = "";

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleShare(intent, true);
    }

    /** "Bagikan → Disiplin": foto/video/audio dari aplikasi lain. */
    private void handleShare(Intent intent, boolean live) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        Uri uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        if (uri == null) return;
        String type = intent.getType() == null ? "" : intent.getType();
        try { String t = getContentResolver().getType(uri); if (t != null) type = t; } catch (Exception ignored) {}
        String kind = type.startsWith("video") ? "video" : type.startsWith("image") ? "image" : "audio";
        String name = "file";
        try (android.database.Cursor c = getContentResolver().query(uri, new String[]{android.provider.OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst() && c.getString(0) != null) name = c.getString(0);
        } catch (Exception ignored) {}
        try {
            org.json.JSONObject o = new org.json.JSONObject();
            o.put("uri", uri.toString()); o.put("name", name); o.put("kind", kind);
            if (live) js("window.onNativeShared && window.onNativeShared(" + org.json.JSONObject.quote(o.toString()) + ")");
            else pendingShared = o.toString();
        } catch (Exception ignored) {}
        intent.setAction(Intent.ACTION_MAIN);
    }

    String takeShared() {
        String v = pendingShared;
        pendingShared = "";
        return v;
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req == FILE_REQ && fileCb != null) {
            fileCb.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(res, data));
            fileCb = null;
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.evaluateJavascript("window.onNativeResume && window.onNativeResume()", null);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == NativeBridge.MEDIA_PERM_REQ) {
            boolean ok = grantResults.length > 0;
            for (int g : grantResults) if (g != android.content.pm.PackageManager.PERMISSION_GRANTED) ok = false;
            js("window.onNativeMediaPermission && window.onNativeMediaPermission(" + ok + ")");
            return;
        }
        if (web != null) web.evaluateJavascript("window.onNativeResume && window.onNativeResume()", null);
    }

    /** Jalankan JavaScript di WebView (aman dipanggil dari thread mana pun). */
    void js(String code) {
        runOnUiThread(() -> { if (web != null) web.evaluateJavascript(code, null); });
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else moveTaskToBack(true);
    }
}
