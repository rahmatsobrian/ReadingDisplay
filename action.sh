#!/system/bin/sh
# Tombol Action (Magisk 28+, KernelSU, APatch): nyalakan/matikan mode baca
MODDIR=${0%/*}
sh "$MODDIR/bin/rdctl" toggle
