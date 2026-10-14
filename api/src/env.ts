// Nạp api/.env sớm nhất có thể (import đầu tiên trong main.ts) — không cần thư viện thêm.
try { process.loadEnvFile(); } catch { /* production thường đặt biến môi trường trực tiếp */ }
