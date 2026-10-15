#!/system/bin/sh
# Dijalankan saat boot (late_start service)
MODDIR=${0%/*}

until [ "$(getprop sys.boot_completed)" = "1" ]; do
  sleep 2
done

# Beri waktu system_server selesai mengatur transformasi warna bawaan
sleep 8

sh "$MODDIR/bin/rdctl" boot >/dev/null 2>&1
