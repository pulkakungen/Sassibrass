<?php
declare(strict_types=1);
$cfg = require __DIR__ . '/config.php';

if (!hash_equals($cfg['admin_key'], (string)($_GET['key'] ?? ''))) {
    http_response_code(403);
    exit('Ingen åtkomst');
}

$rows = [];
$file = __DIR__ . '/data/svar.csv';
if (is_readable($file) && ($fh = fopen($file, 'r'))) {
    fgets($fh); // hoppa över rubrikraden
    while (($r = fgetcsv($fh, null, ';', '"', '')) !== false) {
        $rows[] = $r;
    }
    fclose($fh);
}

$gaster = array_sum(array_map(fn($r) => $r[2] === 'ja' ? (int)$r[3] : 0, $rows));
$e = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
?>
<!doctype html>
<html lang="sv">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>OSA svar</title>
<style>
  body { font-family: system-ui, sans-serif; background: #000; color: #f3e9dc; margin: 0; padding: 24px 16px; }
  h1 { color: #f7871d; margin-top: 0; }
  .wrap { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; min-width: 600px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #2a2a2a; vertical-align: top; }
  th { color: #f7871d; }
  .nej { opacity: .55; }
  a { color: #f7871d; }
</style>
</head>
<body>
<h1>🎃 <?= $gaster ?> gäster kommer</h1>
<p><?= count($rows) ?> svar totalt.</p>
<div class="wrap">
<table>
  <tr><th>Tid</th><th>Namn</th><th>Kommer</th><th>Antal</th><th>Kost</th><th>Meddelande</th></tr>
  <?php foreach (array_reverse($rows) as $r): ?>
  <tr class="<?= $e($r[2]) ?>">
    <?php foreach ($r as $c): ?><td><?= $e(ltrim($c, "'")) ?></td><?php endforeach ?>
  </tr>
  <?php endforeach ?>
</table>
</div>
</body>
</html>
