# Halloweenfest på one.com

1. Fyll i adress och tid i `index.html` (redan ifylld: Slåttervägen 12, Lund).
2. Öppna `config.php` och byt `mail_from` till en adress på din domän och `admin_key` till ett eget lösenord.
3. Ladda upp hela mappen `halloween` till one.com via filhanteraren eller SFTP, t.ex. till `public_html/halloween` (eller innehållet direkt i webbroten).
4. Se svaren på `https://dindoman.se/halloween/svar.php?key=DITT_LOSENORD`. Rådatan sparas i `data/svar.csv`, som är låst för besökare.
