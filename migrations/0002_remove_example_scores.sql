-- Idempotent: hanya menghapus skor dan submission dua fixture lama.
-- Terapkan setelah versi dengan world Stack terbit pada lingkungan tujuan.
DELETE FROM submissions WHERE level_id IN ('example-01', 'example-02');
DELETE FROM progress WHERE level_id IN ('example-01', 'example-02');
