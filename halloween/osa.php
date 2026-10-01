<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');

function reply(int $code, array $body): never {
    http_response_code($code);
    echo json_encode($body, JSON_UNESCAPED_UNICODE);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    reply(405, ['ok' => false, 'error' => 'Fel metod']);
}

$cfg = require __DIR__ . '/config.php';

// Honeypot: robotar fyller i allt, människor ser inte fältet.
if (!empty($_POST['webbplats'])) {
    reply(200, ['ok' => true, 'message' => 'Tack!']);
}

$clean = fn(string $k, int $max) => mb_substr(trim(preg_replace('/\s+/u', ' ', (string)($_POST[$k] ?? ''))), 0, $max);

$namn = $clean('namn', 100);
$kommer = ($_POST['kommer'] ?? '') === 'ja' ? 'ja' : (($_POST['kommer'] ?? '') === 'nej' ? 'nej' : '');
$antal = $kommer === 'ja' ? max(1, min(10, (int)($_POST['antal'] ?? 1))) : 0;
$kost = $kommer === 'ja' ? $clean('kost', 200) : '';
$meddelande = $clean('meddelande', 500);

if ($namn === '' || $kommer === '') {
    reply(400, ['ok' => false, 'error' => 'Fyll i namn och om du kommer']);
}

// Skydda mot formelinjektion när CSV:n öppnas i Excel.
$safe = fn(string $s) => preg_match('/^[=+\-@]/', $s) ? "'" . $s : $s;

$row = [date('Y-m-d H:i'), $safe($namn), $kommer, (string)$antal, $safe($kost), $safe($meddelande)];
// Skapa datamappen med spärrfil om den inte laddades upp,
// så att svaren aldrig går att läsa direkt från webben.
$dir = __DIR__ . '/data';
if (!is_dir($dir)) {
    @mkdir($dir, 0755);
}
if (!file_exists("$dir/.htaccess")) {
    @file_put_contents("$dir/.htaccess", "Require all denied\nDeny from all\n");
}
$file = "$dir/svar.csv";
$new = !file_exists($file);

$fh = fopen($file, 'a');
if (!$fh || !flock($fh, LOCK_EX)) {
    reply(500, ['ok' => false, 'error' => 'Kunde inte spara svaret']);
}
if ($new) {
    fwrite($fh, "\xEF\xBB\xBF"); // BOM så att Excel visar åäö rätt
    fputcsv($fh, ['Tid', 'Namn', 'Kommer', 'Antal', 'Kost', 'Meddelande'], ';', '"', '');
}
fputcsv($fh, $row, ';', '"', '');
flock($fh, LOCK_UN);
fclose($fh);

if (!empty($cfg['mail_to'])) {
    $subject = '=?UTF-8?B?' . base64_encode("OSA halloween: $namn ($kommer)") . '?=';
    $body = "Namn: $namn\nKommer: $kommer\nAntal: $antal\nKost: $kost\nMeddelande: $meddelande\n";
    $headers = "From: {$cfg['mail_from']}\r\nContent-Type: text/plain; charset=UTF-8";
    // -f sätter kuvertavsändaren, som one.com kräver ska vara ett riktigt konto på domänen
    $sent = @mail($cfg['mail_to'], $subject, $body, $headers, '-f' . $cfg['mail_from']);
    if (!$sent) {
        @file_put_contents("$dir/mail.log", date('Y-m-d H:i') . " misslyckades: $namn\n", FILE_APPEND);
    }
}

reply(200, ['ok' => true, 'message' => $kommer === 'ja'
    ? "Tack $namn, vi ses i mörkret den 31 oktober."
    : "Tack för att du svarade, $namn. Vi kommer att sakna dig bland spökena."]);
