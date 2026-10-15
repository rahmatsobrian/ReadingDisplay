#!/system/bin/sh
# Installer Reading Display (Magisk / KernelSU / APatch)

SKIPUNZIP=0

ui_print "======================================"
ui_print "  Reading Display - Mode Baca"
ui_print "  Abu-abu live untuk membaca lama"
ui_print "======================================"

if [ "$KSU" = "true" ]; then
  ui_print "- Root: KernelSU (WebUI dibuka dari manager)"
elif [ "$APATCH" = "true" ]; then
  ui_print "- Root: APatch (WebUI dibuka dari manager)"
else
  ui_print "- Root: Magisk"
  ui_print "- Magisk belum punya WebUI bawaan. Buka WebUI lewat"
  ui_print "  aplikasi KSUWebUI / WebUI X, atau pakai tombol Action."
fi

SDK="${API:-$(getprop ro.build.version.sdk)}"
if [ -n "$SDK" ] && [ "$SDK" -lt 26 ] 2>/dev/null; then
  abort "! Butuh Android 8.0 (API 26) atau lebih baru"
fi

ui_print "- Tidak memerlukan Zygisk (efek diterapkan di compositor sistem)"

mkdir -p /data/adb/reading_display

set_perm_recursive "$MODPATH" 0 0 0755 0644
set_perm "$MODPATH/bin/rdctl" 0 0 0755
set_perm "$MODPATH/service.sh" 0 0 0755
set_perm "$MODPATH/action.sh" 0 0 0755
set_perm "$MODPATH/uninstall.sh" 0 0 0755

# Modul ini tidak mengganti file sistem apa pun
touch "$MODPATH/skip_mount"

ui_print "- Selesai. Reboot, lalu buka WebUI modul."
