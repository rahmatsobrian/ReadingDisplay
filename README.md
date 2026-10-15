# Reading Display — Mode Baca

Modul untuk **Magisk 24+ / KernelSU / APatch** (Android 8.0+).
Layar abu-abu untuk membaca lama, diatur live lewat WebUI.

## Fitur
- **Mode baca**: saturasi 0–100% (0 = abu-abu penuh), kehangatan (kurangi biru), kecerahan maksimum, 5 preset. Slider mengubah layar seketika.
- **Otomatis**: pulihkan saat boot, dan mode baca hanya di aplikasi pilihan.
- **Dua engine**: matriks SurfaceFlinger (penuh) atau monokrom sistem (aksesibilitas).
- **WebUI Material 3 Expressive**; di KernelSU/APatch warna mengikuti tema manager (`mui.kernelsu.org`).

## Instalasi
1. Flash zip lewat manager (Magisk / KernelSU / APatch), reboot.
2. KernelSU / APatch: buka modul → ikon WebUI.
   Magisk: pakai aplikasi **KSUWebUI** atau **WebUI X**, atau tombol **Action** untuk toggle mode baca.

Tidak butuh Zygisk.

## Terminal (root)
```
sh /data/adb/modules/reading_display/bin/rdctl status
sh /data/adb/modules/reading_display/bin/rdctl toggle
sh /data/adb/modules/reading_display/bin/rdctl reset     # matikan semua efek
```

## Cara kerja
`service call SurfaceFlinger 1015` menerima matriks warna 4×4 (kolom-utama, baris terakhir `0 0 0 1`).
WebUI menghitung matriks, `rdctl` memvalidasi lalu mengirimnya. Efek tidak persisten: hilang saat reboot
dan dipulihkan `service.sh`. Bila layar bermasalah, **reboot** selalu mengembalikan warna normal.

## Catatan
- Sistem (Night Light dll.) bisa menimpa matriks; watcher menerapkannya ulang tiap beberapa detik.
- Engine “Monokrom sistem” hanya abu-abu penuh; slider tidak berlaku.
- Data: `/data/adb/reading_display/`.
