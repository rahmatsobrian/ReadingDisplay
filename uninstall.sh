#!/system/bin/sh
# Bersihkan saat modul dihapus
MODDIR=${0%/*}
sh "$MODDIR/bin/rdctl" reset >/dev/null 2>&1
rm -rf /data/adb/reading_display
