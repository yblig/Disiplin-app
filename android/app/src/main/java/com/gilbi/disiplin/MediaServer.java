package com.gilbi.disiplin;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.os.Build;
import android.util.Base64;
import android.util.Size;
import android.webkit.WebResourceResponse;

import androidx.webkit.WebViewAssetLoader;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.net.URLConnection;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/**
 * Menyajikan file media ke WebView lewat https://appassets.androidplatform.net/...
 *   /thumb/<b64uri>     thumbnail JPEG kecil (foto / video)
 *   /media/<b64uri>     file asli (untuk pratinjau foto / video / audio)
 *   /wallfile/<key>     wallpaper alarm yang tersimpan
 * <b64uri> = Base64 URL-safe dari content:// atau file:// URI.
 */
final class MediaServer {
    private MediaServer() {}

    static Uri decode(String path) {
        String p = path;
        int slash = p.indexOf('/');
        if (slash >= 0) p = p.substring(0, slash);
        return Uri.parse(new String(Base64.decode(p, Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING), StandardCharsets.UTF_8));
    }

    static String mimeOf(Context c, Uri u) {
        String m = null;
        try { m = c.getContentResolver().getType(u); } catch (Exception ignored) {}
        if (m == null) m = URLConnection.guessContentTypeFromName(u.getLastPathSegment() == null ? "" : u.getLastPathSegment());
        return m == null ? "application/octet-stream" : m;
    }

    private static WebResourceResponse ok(String mime, InputStream in) {
        WebResourceResponse r = new WebResourceResponse(mime, null, in);
        Map<String, String> h = new HashMap<>();
        h.put("Cache-Control", "max-age=600");
        h.put("Access-Control-Allow-Origin", "*");
        r.setResponseHeaders(h);
        return r;
    }

    static WebViewAssetLoader.PathHandler thumb(Context c) {
        return path -> {
            try {
                Uri u = decode(path);
                Bitmap bmp = thumbnail(c, u, 200);
                if (bmp == null) return null;
                ByteArrayOutputStream bo = new ByteArrayOutputStream();
                bmp.compress(Bitmap.CompressFormat.JPEG, 72, bo);
                return ok("image/jpeg", new ByteArrayInputStream(bo.toByteArray()));
            } catch (Exception e) {
                return null;
            }
        };
    }

    static Bitmap thumbnail(Context c, Uri u, int size) {
        try {
            if (Build.VERSION.SDK_INT >= 29 && "content".equals(u.getScheme())) {
                return c.getContentResolver().loadThumbnail(u, new Size(size, size), null);
            }
        } catch (Exception ignored) {}
        String mime = mimeOf(c, u);
        try {
            if (mime.startsWith("video")) {
                MediaMetadataRetriever r = new MediaMetadataRetriever();
                try {
                    r.setDataSource(c, u);
                    Bitmap f = r.getFrameAtTime(1_000_000);
                    if (f == null) f = r.getFrameAtTime(0);
                    return f == null ? null : scale(f, size);
                } finally { try { r.release(); } catch (Exception ignored) {} }
            }
            BitmapFactory.Options o = new BitmapFactory.Options();
            o.inJustDecodeBounds = true;
            try (InputStream in = c.getContentResolver().openInputStream(u)) { BitmapFactory.decodeStream(in, null, o); }
            int sample = 1;
            while (o.outWidth / (sample * 2) >= size && o.outHeight / (sample * 2) >= size) sample *= 2;
            BitmapFactory.Options o2 = new BitmapFactory.Options();
            o2.inSampleSize = sample;
            try (InputStream in = c.getContentResolver().openInputStream(u)) { return BitmapFactory.decodeStream(in, null, o2); }
        } catch (Exception e) {
            return null;
        }
    }

    private static Bitmap scale(Bitmap b, int size) {
        float s = Math.min(1f, (float) size / Math.max(b.getWidth(), b.getHeight()));
        return s >= 1f ? b : Bitmap.createScaledBitmap(b, Math.max(1, (int) (b.getWidth() * s)), Math.max(1, (int) (b.getHeight() * s)), true);
    }

    static WebViewAssetLoader.PathHandler media(Context c) {
        return path -> {
            try {
                Uri u = decode(path);
                return ok(mimeOf(c, u), c.getContentResolver().openInputStream(u));
            } catch (Exception e) {
                return null;
            }
        };
    }

    static WebViewAssetLoader.PathHandler wallFile(Context c) {
        return path -> {
            try {
                String key = path;
                int slash = key.indexOf('/');
                if (slash >= 0) key = key.substring(0, slash);
                File f = AlarmScheduler.wallFile(c, key);
                if (!f.exists()) return null;
                String mime = AlarmActivity.decodeSampled(f, 32, 32) != null ? "image/jpeg" : "video/mp4";
                return ok(mime, new FileInputStream(f));
            } catch (Exception e) {
                return null;
            }
        };
    }
}
