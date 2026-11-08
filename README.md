# Disiplin 💪

Aplikasi web (PWA) untuk membangun kebiasaan disiplin: pengingat super keras, checklist harian yang dijawab jujur, aturan makan tanpa snack, dan grafik perkembangan mingguan / bulanan / tahunan.

## Fitur
- **Pengingat / alarm** — bangun pagi, mandi, sarapan, olahraga, makan malam, isi checklist, tidur (bisa ditambah/hapus, pilih hari).
- **Volume boost sampai 800%** — di atas 100% suara dikuatkan secara digital (gain + soft-clipper), jadi terdengar jauh lebih keras dari volume normal.
- **Suara dari perangkat** — pilih file mp3/wav/m4a dari HP sebagai suara alarm, atau pakai sirine / beep / kokok bawaan.
- **Kunci soal hitungan** — alarm hanya bisa dimatikan setelah menjawab soal matematika. Tunda maks 1x (5 menit).
- **Checklist harian yang bisa diatur sendiri** — setiap kegiatan wajib dijawab *Ya* / *Tidak*, lalu centang janji jujur sebelum disimpan.
- **Aturan makan** — hanya makan pagi (sekolah) dan makan malam. Kalau ngemil, catat jujur apa yang dimakan.
- **Perkembangan** — grafik batang + tabel keberhasilan per kegiatan untuk minggu, bulan, dan tahun; streak 🔥 hari beruntun skor ≥ 80%.
- **Offline & data di HP** — tersimpan di perangkat, ada ekspor/impor cadangan.

## 📱 APK Android (disarankan — alarm asli)
Download **Disiplin.apk** dari https://github.com/yblig/Disiplin-app/releases/tag/apk-latest, buka di HP, izinkan "Instal dari sumber tidak dikenal".
Di versi APK alarm dijadwalkan oleh Android (AlarmManager): tetap bunyi walau aplikasi ditutup, HP dikunci, atau habis restart; volume alarm HP dinaikkan ke maksimal lalu di-boost lagi (LoudnessEnhancer) sesuai slider sampai 800%.
Setiap push otomatis membangun APK baru lewat GitHub Actions (`.github/workflows/android.yml`). Kode Android ada di folder `android/`.

## Cara pakai (versi web)
1. Hosting folder ini (mis. aktifkan **GitHub Pages** di Settings → Pages → branch ini → root), atau jalankan lokal: `python3 -m http.server` lalu buka `http://localhost:8000`.
2. Buka di HP (Chrome Android disarankan) → menu ⋮ → **Tambahkan ke layar utama**.
3. Tab **Pengingat** → *Izinkan Notifikasi*, atur volume, tes suara.
4. Malam hari biarkan aplikasi terbuka dan nyalakan **Mode Jaga Layar** (redupkan layar, colok charger).

> ⚠️ Keterbatasan browser: suara alarm keras hanya bisa diputar saat aplikasi terbuka (boleh di latar depan dengan layar redup). Jika aplikasi ditutup total, browser tidak mengizinkan web app membunyikan alarm. Untuk jaga-jaga, pasang juga satu alarm cadangan di aplikasi Jam bawaan HP.
