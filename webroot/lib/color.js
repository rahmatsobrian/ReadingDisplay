/*
 * Matematika warna Reading Display (mode baca).
 * Transformasi affine out = A * in, dikirim ke SurfaceFlinger sebagai mat4
 * kolom-utama (16 angka); baris terakhir wajib 0 0 0 1.
 */
(function (root) {
  'use strict';

  var LUMA = [0.2126, 0.7152, 0.0722]; // Rec.709

  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

  /* sat 0..100 (0 = abu-abu penuh), warm 0..100 (kurangi biru), dim 40..100 */
  function readingA(r) {
    var s = clamp(r.sat, 0, 100) / 100;
    var w = clamp(r.warm, 0, 100) / 100;
    var d = clamp(r.dim, 40, 100) / 100;
    var g = [1, 1 - 0.18 * w, 1 - 0.55 * w].map(function (x) { return x * d; });
    return [0, 1, 2].map(function (i) {
      return [0, 1, 2].map(function (j) {
        return ((i === j ? s : 0) + (1 - s) * LUMA[j]) * g[i];
      });
    });
  }

  function fmt(v) {
    var x = Math.abs(v) < 5e-6 ? 0 : v;
    return x.toFixed(5);
  }

  // mat4 kolom-utama: indeks = kolom*4 + baris
  function colMajor(A) {
    return [
      fmt(A[0][0]), fmt(A[1][0]), fmt(A[2][0]), '0',
      fmt(A[0][1]), fmt(A[1][1]), fmt(A[2][1]), '0',
      fmt(A[0][2]), fmt(A[1][2]), fmt(A[2][2]), '0',
      '0.00000', '0.00000', '0.00000', '1'
    ];
  }

  function readingMatrix(p) { return colMajor(readingA(p.reading)); }
  function identity16() { return colMajor([[1, 0, 0], [0, 1, 0], [0, 0, 1]]); }

  /* feColorMatrix (5x4, baris-utama) untuk pratinjau / mode demo */
  function svgValues(m) {
    var n = m.map(Number);
    var row = function (i) { return [n[i], n[4 + i], n[8 + i], 0, 0].join(' '); };
    return row(0) + ' ' + row(1) + ' ' + row(2) + ' 0 0 0 1 0';
  }

  /* Terapkan matriks ke satu warna [r,g,b] 0..1 (untuk uji) */
  function apply(m, rgb) {
    var n = m.map(Number);
    return [0, 1, 2].map(function (i) {
      return clamp(n[i] * rgb[0] + n[4 + i] * rgb[1] + n[8 + i] * rgb[2], 0, 1);
    });
  }

  var api = { LUMA: LUMA, clamp: clamp, readingMatrix: readingMatrix, identity16: identity16, svgValues: svgValues, apply: apply };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RDColor = api;
})(typeof window !== 'undefined' ? window : this);
