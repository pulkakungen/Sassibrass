<?php
declare(strict_types=1);
$cfg = require __DIR__ . '/config.php';

$key = (string)($_GET['key'] ?? '');
if (!hash_equals($cfg['admin_key'], $key)) {
    http_response_code(403);
    exit('Ingen åtkomst');
}

$file = __DIR__ . '/data/svar.csv';
$header = ['Tid', 'Namn', 'Kommer', 'Antal', 'Kost', 'Meddelande'];
// Varje rad får ett id utifrån sitt innehåll, så att rätt rad tas bort
// även om nya svar har kommit in sedan sidan laddades.
$rowId = fn(array $r) => md5(implode("\x1f", $r));

function readRows($fh): array {
    rewind($fh);
    fgets($fh); // hoppa över rubrikraden
    $rows = [];
    while (($r = fgetcsv($fh, null, ';', '"', '')) !== false) {
        if ($r !== [null]) $rows[] = $r;
    }
    return $rows;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && is_file($file) && ($fh = fopen($file, 'r+'))) {
    flock($fh, LOCK_EX);
    $rows = readRows($fh);
    $del = (string)($_POST['delete'] ?? '');
    $keep = $del === 'alla' ? [] : array_values(array_filter($rows, fn($r) => $rowId($r) !== $del));
    ftruncate($fh, 0);
    rewind($fh);
    fwrite($fh, "\xEF\xBB\xBF");
    fputcsv($fh, $header, ';', '"', '');
    foreach ($keep as $r) fputcsv($fh, $r, ';', '"', '');
    fflush($fh);
    flock($fh, LOCK_UN);
    fclose($fh);
    // Ladda om med GET så att en omladdning inte skickar formuläret igen
    header('Location: svar.php?key=' . rawurlencode($key), true, 303);
    exit;
}

$rows = [];
if (is_readable($file) && ($fh = fopen($file, 'r'))) {
    $rows = readRows($fh);
    fclose($fh);
}

$gaster = array_sum(array_map(fn($r) => $r[2] === 'ja' ? (int)$r[3] : 0, $rows));
$e = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
$action = 'svar.php?key=' . $e(rawurlencode($key));
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
  table { border-collapse: collapse; width: 100%; min-width: 640px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #2a2a2a; vertical-align: top; }
  th { color: #f7871d; }
  .nej { opacity: .55; }
  form { margin: 0; }
  button {
    font: inherit; font-size: .85rem; color: #f3e9dc; background: transparent;
    border: 1px solid #555; padding: 4px 10px; cursor: pointer;
  }
  button:hover { border-color: #e5484d; color: #e5484d; }
  .top { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; margin-bottom: 12px; }
  .top p { margin: 0; }
</style>
</head>
<body>
<h1>🎃 <?= $gaster ?> gäster kommer</h1>
<div class="top">
  <p><?= count($rows) ?> svar totalt.</p>
  <?php if ($rows): ?>
  <form method="post" action="<?= $action ?>" onsubmit="return confirm('Ta bort ALLA svar? Det går inte att ångra.')">
    <button name="delete" value="alla">Töm listan</button>
  </form>
  <?php endif ?>
</div>
<div class="wrap">
<table>
  <tr><th>Tid</th><th>Namn</th><th>Kommer</th><th>Antal</th><th>Kost</th><th>Meddelande</th><th></th></tr>
  <?php foreach (array_reverse($rows) as $r): ?>
  <tr class="<?= $e($r[2]) ?>">
    <?php foreach ($r as $c): ?><td><?= $e(ltrim((string)$c, "'")) ?></td><?php endforeach ?>
    <td>
      <form method="post" action="<?= $action ?>" onsubmit="return confirm('Ta bort svaret från <?= $e(addslashes($r[1])) ?>?')">
        <button name="delete" value="<?= $rowId($r) ?>">Ta bort</button>
      </form>
    </td>
  </tr>
  <?php endforeach ?>
</table>
</div>
</body>
</html>
