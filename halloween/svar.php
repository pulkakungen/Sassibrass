<?php
declare(strict_types=1);
$cfg = require __DIR__ . '/config.php';

$key = (string)($_GET['key'] ?? '');
if (!hash_equals($cfg['admin_key'], $key)) {
    http_response_code(403);
    exit('Ingen åtkomst');
}

$dir = __DIR__ . '/data';
$file = "$dir/svar.csv";
$header = ['Tid', 'Namn', 'Kommer', 'Antal', 'Kost', 'Meddelande'];
// Varje rad får ett id utifrån sitt innehåll, så att rätt rad ändras
// även om nya svar har kommit in sedan sidan laddades.
$rowId = fn(array $r) => md5(implode("\x1f", $r));
$self = 'svar.php?key=' . rawurlencode($key);

function readRows($fh): array {
    rewind($fh);
    fgets($fh); // hoppa över rubrikraden
    $rows = [];
    while (($r = fgetcsv($fh, null, ';', '"', '')) !== false) {
        if ($r !== [null]) $rows[] = $r;
    }
    return $rows;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!is_dir($dir)) @mkdir($dir, 0755);
    if (!file_exists("$dir/.htaccess")) @file_put_contents("$dir/.htaccess", "Require all denied\nDeny from all\n");

    if ($fh = fopen($file, 'c+')) {
        flock($fh, LOCK_EX);
        $rows = readRows($fh);
        $del = (string)($_POST['delete'] ?? '');

        if ($del === 'alla') {
            $rows = [];
        } elseif ($del !== '') {
            $rows = array_values(array_filter($rows, fn($r) => $rowId($r) !== $del));
        } elseif (isset($_POST['save'])) {
            // Samma tvätt och gränser som i osa.php
            $clean = fn(string $k, int $max) => mb_substr(trim(preg_replace('/\s+/u', ' ', (string)($_POST[$k] ?? ''))), 0, $max);
            $safe = fn(string $s) => preg_match('/^[=+\-@]/', $s) ? "'" . $s : $s;
            $namn = $clean('namn', 100);
            $kommer = ($_POST['kommer'] ?? '') === 'nej' ? 'nej' : 'ja';
            $antal = $kommer === 'ja' ? max(1, min(10, (int)($_POST['antal'] ?? 1))) : 0;
            $kost = $kommer === 'ja' ? $clean('kost', 200) : '';
            $meddelande = $clean('meddelande', 500);

            if ($namn !== '') {
                $id = (string)$_POST['save'];
                $new = [$safe($namn), $kommer, (string)$antal, $safe($kost), $safe($meddelande)];
                $found = false;
                foreach ($rows as $i => $r) {
                    if ($id !== '' && $rowId($r) === $id) {
                        $rows[$i] = array_merge([$r[0]], $new); // behåll ursprunglig tid
                        $found = true;
                        break;
                    }
                }
                if (!$found) $rows[] = array_merge([date('Y-m-d H:i')], $new);
            }
        }

        ftruncate($fh, 0);
        rewind($fh);
        fwrite($fh, "\xEF\xBB\xBF");
        fputcsv($fh, $header, ';', '"', '');
        foreach ($rows as $r) fputcsv($fh, $r, ';', '"', '');
        fflush($fh);
        flock($fh, LOCK_UN);
        fclose($fh);
    }
    // Ladda om med GET så att en omladdning inte skickar formuläret igen
    header("Location: $self", true, 303);
    exit;
}

$rows = [];
if (is_readable($file) && ($fh = fopen($file, 'r'))) {
    $rows = readRows($fh);
    fclose($fh);
}

$gaster = array_sum(array_map(fn($r) => $r[2] === 'ja' ? (int)$r[3] : 0, $rows));
$e = fn($s) => htmlspecialchars(ltrim((string)$s, "'"), ENT_QUOTES, 'UTF-8');
$action = htmlspecialchars($self, ENT_QUOTES, 'UTF-8');

// Formulär för att ändra en rad (?edit=id) eller lägga till en ny (?edit=ny)
$edit = (string)($_GET['edit'] ?? '');
$editRow = null;
if ($edit === 'ny') {
    $editRow = ['', '', 'ja', '1', '', ''];
} elseif ($edit !== '') {
    foreach ($rows as $r) if ($rowId($r) === $edit) $editRow = $r;
}
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
  h2 { color: #f7871d; margin: 0 0 16px; font-size: 1.3rem; }
  .wrap { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; min-width: 700px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #2a2a2a; vertical-align: top; }
  th { color: #f7871d; }
  .nej { opacity: .55; }
  form { margin: 0; }
  .actions { display: flex; gap: 6px; white-space: nowrap; }
  button, .btn {
    font: inherit; font-size: .85rem; color: #f3e9dc; background: transparent; text-decoration: none;
    border: 1px solid #555; padding: 4px 10px; cursor: pointer; display: inline-block;
  }
  button:hover, .btn:hover { border-color: #f7871d; color: #f7871d; }
  .danger:hover { border-color: #e5484d; color: #e5484d; }
  .primary { background: #f7871d; border-color: #f7871d; color: #000; font-weight: 600; }
  .primary:hover { color: #000; background: #ffa646; }
  .top { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; margin-bottom: 12px; }
  .top p { margin: 0; }
  .top div { display: flex; gap: 8px; }
  .editor { max-width: 480px; border: 1px solid #f7871d; padding: 20px; margin-bottom: 24px; }
  .editor form { display: grid; gap: 14px; }
  .editor label { display: grid; gap: 4px; font-size: .9rem; }
  .editor input, .editor select, .editor textarea {
    font: inherit; color: #f3e9dc; background: #111; border: 1px solid #333; padding: 8px 10px;
  }
  .editor .row { display: flex; gap: 8px; }
</style>
</head>
<body>
<h1>🎃 <?= $gaster ?> gäster kommer</h1>

<?php if ($editRow !== null): ?>
<section class="editor">
  <h2><?= $edit === 'ny' ? 'Lägg till gäst' : 'Ändra svar' ?></h2>
  <form method="post" action="<?= $action ?>">
    <label>Namn <input name="namn" value="<?= $e($editRow[1]) ?>" required maxlength="100"></label>
    <label>Kommer
      <select name="kommer">
        <option value="ja" <?= $editRow[2] === 'ja' ? 'selected' : '' ?>>Ja</option>
        <option value="nej" <?= $editRow[2] === 'nej' ? 'selected' : '' ?>>Nej</option>
      </select>
    </label>
    <label>Antal <input name="antal" type="number" min="1" max="10" value="<?= max(1, (int)$editRow[3]) ?>"></label>
    <label>Kost <input name="kost" value="<?= $e($editRow[4]) ?>" maxlength="200"></label>
    <label>Meddelande <textarea name="meddelande" rows="3" maxlength="500"><?= $e($editRow[5]) ?></textarea></label>
    <div class="row">
      <button class="primary" name="save" value="<?= $edit === 'ny' ? '' : $e($edit) ?>">Spara</button>
      <a class="btn" href="<?= $action ?>">Avbryt</a>
    </div>
  </form>
</section>
<?php elseif ($edit !== ''): ?>
<p>Svaret finns inte längre. Det kan ha ändrats eller tagits bort. <a class="btn" href="<?= $action ?>">Tillbaka</a></p>
<?php endif ?>

<div class="top">
  <p><?= count($rows) ?> svar totalt.</p>
  <div>
    <a class="btn" href="<?= $action ?>&amp;edit=ny">Lägg till gäst</a>
    <?php if ($rows): ?>
    <form method="post" action="<?= $action ?>" onsubmit="return confirm('Ta bort ALLA svar? Det går inte att ångra.')">
      <button class="danger" name="delete" value="alla">Töm listan</button>
    </form>
    <?php endif ?>
  </div>
</div>
<div class="wrap">
<table>
  <tr><th>Tid</th><th>Namn</th><th>Kommer</th><th>Antal</th><th>Kost</th><th>Meddelande</th><th></th></tr>
  <?php foreach (array_reverse($rows) as $r): $id = $rowId($r); ?>
  <tr class="<?= $e($r[2]) ?>">
    <?php foreach ($r as $c): ?><td><?= $e($c) ?></td><?php endforeach ?>
    <td class="actions">
      <a class="btn" href="<?= $action ?>&amp;edit=<?= $id ?>">Ändra</a>
      <form method="post" action="<?= $action ?>" onsubmit="return confirm('Ta bort svaret från <?= $e(addslashes(ltrim($r[1], "'"))) ?>?')">
        <button class="danger" name="delete" value="<?= $id ?>">Ta bort</button>
      </form>
    </td>
  </tr>
  <?php endforeach ?>
</table>
</div>
</body>
</html>
