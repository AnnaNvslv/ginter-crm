# FIXES.md — Ginter CRM

## 2026-07-12
Первая версия CRM.
- Вход по имени (Ervin / Bojana / Anna), общий пароль 222 (таблица `users`, план в открытом виде — TODO: захешировать)
- Пациенты: ФИО, возраст, телефон, ТКТ, дата обращения, заметки
- Рецепты: назначение (для дали/близи/компьютера/постоянного ношения/прогрессивные/бифокальные), OD/OS sph/cyl/ax, add/degr/pd, галочка "рецепт клиента"
- Заказы: переключатель Очки / Контактные линзы
  - Очки: оправа (назначение, цена, галочка "оправа клиента") + линзы (назначение, название, цена, скидка %, кол-во) — автосумма
  - Контактные линзы: название, BC, диоптрии, срок замены, цена, кол-во — автосумма
  - Привязка к рецепту, предоплата, доплата (расч.), рассрочка с историей платежей (installments)
- Стек: vanilla JS, Supabase (project `flxewreibnkyfoccfjtg`), GitHub Pages

## 2026-07-13
Интерфейс переведён на сербский (латиница). Существенный редизайн по фидбэку:
- `patients`: имя разделено на `first_name` / `last_name` (было единое поле `name`)
- Рецепты: назначение и все поля (sph/cyl/ax/add/degr/pd) — свободный текст без валидации (можно `+2,5`, `-0.5` и т.п.), колонки в БД переведены в `text`
- Вкладка Рецепты теперь первая (была Info); порядок: Recepti → Porudžbine → Info
- Заказы полностью переработаны:
  - Окна (Okviri) и стёкла (Stakla) вынесены в отдельные таблицы `order_frames` / `order_lenses` — можно добавить несколько окон и несколько стёкол в один заказ (кнопки "+ Dodaj okvir" / "+ Dodaj stakla")
  - У каждого окна: назначение (пресет), šifra okvira (4 цифры), цена, галочка "klijentov"
  - У каждого стекла: назначение (пресет), название (широкое поле), цена/шт, скидка %, количество
  - Терминология: Stakla = линзы для очков, Sočiva = контактные линзы (раздел заказа с типом "Kontaktna sočiva" не меняется)
  - Живой предпросчёт суммы в форме заказа
  - В списке заказов при рассрочке — видно "Ostalo za uplatu" и кнопка "+ Dodaj uplatu" прямо в карточке (без открытия формы редактирования)
- Колонки `orders.frame_*`, `orders.lens_*`, `orders.purpose` удалены (перенесено в `order_frames`/`order_lenses`)

## 2026-07-15
Крупная переработка навигации под рост базы (6 лет пациентов):
- Верхняя навигация с 4 разделами: **Klijenti / Porudžbine / Pregledi / Dugovanja** (новый файл `js/nav.js`, функция `switchSection()`)
- **Klijenti**: список пациентов теперь сгруппирован по первой букве фамилии (`last_name`) с буквенным индексом слева для быстрого перехода (`scrollToLetter()`), у каждой буквы — счётчик пациентов. Строка списка: аватар-инициалы, имя, телефон, дата последней посете справа, бейдж "dug" если есть непогашенная рассрочка
- **Porudžbine** (новый раздел) — таблица всех заказов по всем пациентам: дата, пациент, тип, номер, сумма, статус. Поиск по имени пациента (через предварительный поиск patient_id) и по дате, пагинация по 50 (`js/orders.js`: `loadOrdersSection`, `renderOrdersSectionTable`)
- **Pregledi** (новый раздел) — аналогичная таблица по всем рецептам: дата, пациент, назначение, OD/OS sph/cyl/ax, PD. Поиск по имени/дате, пагинация по 50 (`js/prescriptions.js`: `loadExamsSection`, `renderExamsSectionTable`)
- **Dugovanja** (новый раздел) — таблица должников: заказы с `has_installment=true`, где `remaining = total_amount - prepayment - Σ(installments.amount) > 0`. Столбцы: номер заказа, пациент, дата заказа, сумма, оплачено, остаток, дата последней уплаты (`js/orders.js`: `loadDebtsData`, `renderDebtsTable`). Счётчик должников — бейдж на табе
- Клик по строке в Porudžbine/Pregledi/Dugovanja → переход к карточке пациента с нужной вкладкой (`goToPatient()` в `js/nav.js`)
- Recepti в карточке пациента переведены в табличный вид (OD/OS × Sph/Cyl/Ax/Add/Degr/PD) вместо текстовых строк
- Okviri/Stakla в карточке заказа тоже переведены в табличный вид

## 2026-07-20 (часть 1 — без изменений схемы БД)
- Recept: PD переставлен перед Add (было Add/Degr/PD → стало PD/Add/Degr)
- Форма заказа: поле "Avans" переименовано в "Akontacija"; в блок с суммой добавлена живая строка "Ostalo za uplatu" (Ukupno − Akontacija), пересчитывается на лету
- Карточка окна/стёкол/akontacije: цена окна, цена/скидка стекла, akontacija — были предзаполнены нулём, из-за чего плейсхолдер не был виден и легко было промахнуться; теперь поля пустые с плейсхолдером, пока не введено значение
- Карточка заказа в списке заказов пациента: строки окон и стёкол теперь подписаны "Okvir — <namena>" / "Stakla — <namena>" вместо голой namena — понятно, что относится к оправе, а что к стеклу; надпись "Avans" в итогах заказа → "Akontacija"

Запушено: `crm.html`, `js/orders.js`.

## 2026-07-21 (часть 2 — без изменений схемы БД)
- Recept: Namena теперь выпадающий список (5 фиксированных значений: za daljinu, za blizinu, za računar, progresivno, kontaktna sočiva) вместо свободного текста
- Forma porudžbine: после "Sačuvaj" popup теперь всегда закрывается и переключает пациента на вкладку Porudžbine (раньше при рассрочке popup оставался открытым для ввода уплат — теперь для этого используется кнопка "+ Dodaj uplatu" прямо в карточке заказа)

Запушено: `crm.html`, `js/orders.js`.

## 2026-07-21 (часть 3 — SQL прогнан, все отложенные пункты реализованы)
SQL выполнен: `prescriptions` получила `bc`, `dia`, `checked_by`, `comment`, `created_by`; `orders` получила `payment_method`, `created_by`, `izrada_price`; `installments` получила `created_by`; создана таблица `order_prescriptions` (многие-ко-многим заказ↔рецепт), старые связи из `orders.prescription_id` перенесены в неё.

- **Recept**: при namena = kontaktna sočiva появляются поля BC и DIA (скрыты для остальных namena, `toggleRxClFields()`); новое поле "Pregled izvršio/la" (Ervin/Anna/Bojana/lični); новое поле "Komentar"; карточка рецепта показывает BC/DIA (если это kontaktna sočiva), Pregled izvršio/la, komentar, и внизу справа мелким текстом "Uneo/la: <ime> · <datum>"
- **Porudžbina — мультиселект recepata**: вместо одиночного select теперь список чекбоксов по всем рецептам пациента; у каждого — namena, дата и строка с диоптриями (`OD sph/cyl/ax · OS sph/cyl/ax · PD`, плюс BC/DIA для kontaktna sočiva) — видно сразу, не открывая рецепт. Можно выбрать несколько (например, za dalj + za bliz в один заказ). Связи хранятся в `order_prescriptions`, при сохранении заказа старые связи для этого заказа удаляются и пишутся заново
- **Porudžbina — Izrada**: новое поле в блоке Okviri/Stakla (только для naoc̍are), учитывается в Ukupno и в живом пересчёте Ostalo za uplatu
- **Porudžbina — Način plaćanja**: выпадающий список Gotovinom/Kartica/Ček/Virman рядом с Akontacija, отображается в карточке заказа
- **Карточка заказа**: сверху показывает связанные recepti (namena через запятую), строка "Izrada" в итогах если введена, "Način plaćanja" в блоке суммы, внизу справа "Uneo/la: <ime> · <datum>"
- **История uplata**: у каждой installment теперь видно, кто её внёс (created_by), как в списке в форме заказа, так и через быстрое добавление уплаты прямо из карточки

Запушено: `crm.html`, `js/prescriptions.js`, `js/orders.js`, `css/crm.css`.

## 2026-07-21 (часть 4 — рецепты выпадающим списком вместо чекбоксов, группировка карточки заказа)
- Форма заказа: привязка рецептов переделана с чекбокс-листа на выпадающие списки по одному на строку (как окна/стёкла) + кнопка "+ Dodaj recept" для добавления ещё одной строки; в каждом варианте списка видны диоптрии
- Карточка заказа (вкладка Porudžbine у пациента): вместо плоского списка "Recepti: ..." + отдельных таблиц окон/стёкол — теперь группировка по namena: для каждой namena свой блок с рецептом (диоптрии) сверху, окном(-ами) и стёклами снизу. Группировка идёт по совпадению текстового значения namena окна/стекла и namena привязанного рецепта — если у окна/стекла и рецепта разные списки назначений (например Soc̍iva-заказ или "za računar" vs "za kompjuter"), они попадут в отдельные блоки; пока не унифицировано
- Итоговый блок суммы в карточке заказа: если заказ НЕ на рате — "Doplata" теперь обычной строкой, а "Iznos" (полная стоимость) стал крупным/выделенным; если на рате — как раньше "Ostalo za uplatu" крупно выделено красным

Запушено: `crm.html`, `js/orders.js`, `js/prescriptions.js`.

## 2026-08-01 (часть 1 — без изменений схемы БД)
- **Список пациентов**: отображение имени изменено на "Фамилия Имя" (было "Имя Фамилия") — теперь совпадает с сортировкой по фамилии, легче искать глазами. Затронуло и заголовок карточки пациента (`fullName()` в `js/patients.js`)
- **Модалки (Pacijent / Recept / Porudžbina)**:
  - При открытии popup курсор теперь сразу ставится в первое поле формы — не нужно кликать мышкой (`openModal()` в `js/utils.js`)
  - Enter в текстовом поле/select больше не сохраняет и не закрывает форму — переводит фокус на следующее поле. На последнем поле Enter фокусирует кнопку "Sačuvaj" (повторный Enter уже сохраняет). Textarea и кнопки ведут себя как обычно (перенос строки / клик) — новая функция `initEnterNavigation()` в `js/utils.js`, работает и для динамически добавляемых полей (окна/стёкла/рецепты/рассрочка в форме заказа)

Запушено: `js/patients.js`, `js/utils.js`.

## 2026-08-01 (часть 2 — без изменений схемы БД)
- **Datum se prenosi kroz lanac Pacijent → Recept → Porudžbina**: ako se odmah nakon kreiranja NOVOG pacijenta unosi recept i porudžbina (bez zatvaranja kartice), datum porudžbine se automatski postavlja na datum posete koji je unet za pacijenta (umesto na današnji datum) — korisno kad se unosi puno starih pacijenata odjednom, ne treba svaki put ponovo kucati datum. Čim se otvori pacijent koji već postoji i doda mu se recept/porudžbina posebno (ne odmah nakon kreiranja), datum je uvek današnji. Mehanizam: promenljiva `pendingQuickAddDate` u `js/patients.js`, postavlja se samo pri kreiranju novog pacijenta, prosleđuje se kroz `savePrescriptionForm()` → `openAddOrderModal(dateOverride)`, i briše se čim se iskoristi ili ako se lanac prekine (Otkaži na receptu, odustajanje od porudžbine)
  - ⚠️ Datum RECEPTA se još uvek ne može ručno menjati (nema polja u formi) — recept i dalje pokazuje `created_at` (vreme unosa). Da bi i recept nasledio datum pacijenta (i da bi se mogao ručno zadati za stare preglede), potrebna je nova kolona — vidi SQL ispod
- **Porudžbina — okvir/stakla prate namenu recepta**: kad se doda ili promeni recept u polju "Povezati recept(e)", odmah se dodaje (ili prebacuje na novu namenu) po jedan red okvira i jedan red stakala sa istom namenom — ne treba ručno klikati "+ Dodaj okvir"/"+ Dodaj stakla" i birati namenu. Ako više recepata i dalje koristi staru namenu, taj okvir/stakla se ne diraju (`js/orders.js`: `ensureFrameAndLensForPurpose()`, `updatePrescriptionRow()`)

Запушено: `js/patients.js`, `js/prescriptions.js`, `js/orders.js`, `crm.html`.

## 2026-08-01 (часть 3 — bugfix + SQL прогнан + автоподсказки за stakla)
**Bugfix**: заказ с контактными линзами не сохранялся — поле BC (`orders.cl_bc`) имело тип `numeric`, а вносилось через запятую ("8,6"), что невалидно для numeric. Исправлено миграцией `ALTER TABLE orders ALTER COLUMN cl_bc TYPE text` (как и `prescriptions.bc`, который уже был text).

**SQL прогнан**: `orders.discount_percent` (numeric, default 0), `prescriptions.rx_date` (date, default CURRENT_DATE), `order_lenses.lens_index` (text), `order_lenses.lens_coating` (text).

- **Naziv stakla — automatski predlozi**: pri kliku/kucanju u polje "naziv stakla" u formi porudžbine nudi se `<datalist>` sa svim nazivima koji su ikad uneti (kod bilo kog pacijenta, bilo kog zaposlenog) — ne treba ponovo kucati isti naziv. Isto i za nova polja **Indeks** (npr. 1.5/1.6/1.67/1.74) i **Premaž** (npr. AR/UV/blue) — kolone `order_lenses.lens_index` / `lens_coating`, učitavaju se u `loadLensAutocompleteData()` (`js/orders.js`), pune `<datalist>` elemente definisane u `crm.html` (`lens-name-list`, `lens-index-list`, `lens-coating-list`)
- **Red stakla u formi porudžbine redizajniran**: naziv stakla je sada u svom širokom redu (gore, pored namene), indeks/premaž u sredini, cena/popust/kol. na dnu — umesto jednog zbijenog reda sa 6 uskih polja (`renderLensRows()` u `js/orders.js`)
- Prikaz stakala u karčici porudžbine (`renderOrderCard` → `lensDescriptor()`) sada uključuje indeks i premaž pored naziva, ako su uneti

Запушено (JS/HTML): `crm.html`, `js/orders.js`.

## 2026-08-01 (часть 4 — čist katalog predloga umesto istorije, SQL progan)
Anna je primetila da je istorija `order_lenses` puna neujednačenih unosa (mnogo varijacija istog naziva/indeksa) i tražila da se to počisti.

**SQL progan**: nova tabela `lens_catalog` (`id uuid`, `kind text` — 'name'/'index'/'coating', `value text`, `unique(kind, value)`) — bez RLS, kao i ostale tabele u ovom projektu.

- **Predlozi sada dolaze iz `lens_catalog`, a ne iz istorije porudžbina** — katalog kreće prazan, tako da se sav stari neujednačen unos odmah gubi iz predloga (`loadLensAutocompleteData()` sada čita `lens_catalog` umesto `order_lenses`)
- **Katalog se sam puni ubuduće**: pri svakom čuvanju porudžbine, `updateLensCatalog()` upisuje naziv/indeks/premaž svakog stakla u katalog (`upsert` sa `ignoreDuplicates`, po `unique(kind, value)`) — tako se predlozi grade postepeno iz stvarno korišćenih vrednosti od danas pa nadalje, bez ručnog održavanja
- Ako se kasnije primeti pogrešna/duplirana vrednost u predlozima, briše se jednom SQL komandom iz `lens_catalog` (npr. `delete from lens_catalog where kind='name' and value='...'`)

Запушено: `js/orders.js`.

⏳ **Ostaje da se uradi** (SQL kolone postoje, JS/HTML deo još nije napisan):
- Polje "Datum recepta" u formi recepta — koristi `prescriptions.rx_date`, nasleđuje `pendingQuickAddDate` u lancu Pacijent→Recept→Porudžbina, inače današnji datum

## 2026-08-08 (skidka na porudžbinu — bez izmena šeme, kolona već postojala)
- **Forma porudžbine**: novo polje "Popust (%)" (`order-form-discount`) između Kontaktna sočiva/Okviri bloka i total-box-a; upisuje se u `orders.discount_percent`
- Popust se primenjuje na ukupan iznos (i za naočare i za kontaktna sočiva) preko `applyDiscount(subtotal, percent)` — zaokruženo, isto ponašanje u živom pretpregledu forme (`updateOrderFormTotal()`) i pri čuvanju (`saveOrderForm()`, upisuje se u `total_amount`)
- **Karčica porudžbine** (`renderOrderCard`): ako je `discount_percent > 0`, iznad "Ukupno" prikazuje se "Cena pre popusta" i "Popust N%" red; "Ukupno" i "Ostalo za uplatu" već računaju sa popustom
- Popust se čuva samo na nivou cele porudžbine (ne po stavci) — postojeći "popust %" na pojedinačnim stvarima (`order_lenses.discount`) ostaje nezavisan i primenjuje se pre ovog

Запушено: `crm.html`, `js/orders.js`.

## 2026-08-08 (recept — lanac "Dodaj još recept")
- **Modal Recepta**: novo dugme "+ Dodaj još recept" pored "Otkaži"/"Sačuvaj" — klikom se trenutni recept odmah snima (insert), forma se prazni i ostaje otvorena za unos sledećeg recepta. Iznad forme se pojavljuje napomena "Već dodato u ovoj porudžbini: N". Dugme je vidljivo samo pri unosu NOVOG recepta — sakriveno pri izmeni postojećeg (`js/prescriptions.js`: `saveAndAddAnotherPrescription()`, `updateRxChainUI()`, `rxChain` niz)
- Kad se lanac završi normalnim "Sačuvaj" (poslednji recept), **svi** recepti iz lanca (uključujući poslednji) se odjednom povezuju na novu porudžbinu — forma porudžbine se otvara sa svim njima u "Povezati recept(e)", i za svaku njihovu namenu se odmah dodaje po jedan red okvira i stakala (`savePrescriptionForm()`)
- Datum porudžbine i dalje prati postojeći mehanizam `pendingQuickAddDate` (prva uneta poseta pacijenta) — lanac recepata ga ne dira, briše se tek kad se otvori forma porudžbine
- Zatvaranje modala (Otkaži / × / Esc) u sred lanca odbacuje samo trenutnu (nesačuvanu) formu — recepti već sačuvani preko "+ Dodaj još recept" ostaju u bazi, ali se ne povežu automatski ni sa jednom porudžbinom (ostaju kao obični recepti pacijenta, mogu se ručno povezati kroz "Povezati recept(e)" u formi porudžbine)

Запушено: `crm.html`, `js/prescriptions.js`.

## 2026-08-08 (brojevi na tabovima Recepti/Porudžbine)
- Tabovi u kartici pacijenta sada pokazuju broj recepata i broj (nepobrisanih) porudžbina u sivom "pilulastom" bedžu pored naziva — npr. "Recepti 3", "Porudžbine 0" (`js/patients.js`: `countPatientPrescriptions()`, `countPatientOrders()` u `renderPatientCard()`)
- Brojevi se ažuriraju uživo posle svake izmene (dodavanje/brisanje recepta ili porudžbine, uključujući lanac "Dodaj još recept") — `renderPrescriptionsTab()` i `renderOrdersTab()` pozivaju `updateTabCount()` posle svakog učitavanja liste, bez potrebe za ponovnim otvaranjem kartice pacijenta
- CSS: `.tab-count` (neutralna siva pilula, na aktivnom tabu postaje plava) — odvojeno od `.nav-tab .count-badge` (crveni bedž za dugovanja na gornjoj navigaciji), da se brojevi recepata/porudžbina ne mešaju vizuelno sa upozorenjem o dugu

Запушено: `crm.html`, `css/crm.css`, `js/patients.js`, `js/prescriptions.js`, `js/orders.js`.

## 2026-08-17 (brz unos starih pacijenata — bez izmena šeme, osim jedne kolone)

Anna unosi veliki broj starih pacijenata odjednom (retroaktivno) i tražila je da se taj unos ubrza — manje klikova mišem, više Enter-a, manje ponovnog kucanja istih vrednosti.

- **Prečica za "Novi pacijent"**: dugme fizički desno od "1" na tastaturi (`Backquote` — `~` na EN rasporedu, "ё" na RU, radi identično na oba jer se prati fizički kod tastera, ne karakter) sada odmah otvara formu novog pacijenta kad je aktivna sekcija Klijenti. Ne radi dok je fokus u polju za unos ili dok je otvoren neki modal (`js/nav.js`, novi `keydown` listener).
- **Enter-navigacija preskače Komentar/Napomene**: prethodno je Enter iz poslednjeg polja (npr. poslednja "Pregled izvršio/la" čekboks) upadao u textarea Komentar/Napomene — dalji Enter je tamo samo pravio novi red, pa se moralo mišem kliknuti na "Sačuvaj". Sada su ta tri retko popunjavana polja (`patient-form-notes`, `rx-form-comment`, `order-form-comment`) markirana klasom `enter-skip` i `initEnterNavigation()` (`js/utils.js`) ih preskače u lancu — Enter ide pravo na dugme "Sačuvaj" (prvi Enter ga fokusira, drugi snima, kao i ranije). Ručni klik/Tab u ta polja i dalje radi normalno, kao i Enter unutar njih (novi red).
- **Recept — redosled polja**: "Klijentov recept" i "Pregled izvršio/la" (Ervin/Anna/Bojana) premešteni odmah ispod "Namena", iznad OD/OS dioptrija (bilo je posle dioptrija, ispod BC/DIA) — `crm.html`.
- **Recept — lanac "+ Dodaj još recept"**: kad je na prethodnom receptu bio označen neki od "Pregled izvršio/la" (npr. Ervin), ista oznaka se sada automatski prenosi na sledeći recept u lancu — ne treba ponovo klikati. Namena sledećeg recepta u lancu podrazumevano postaje "za blizinu" (najc̍ešći slučaj: prvi recept za daljinu, drugi za blizinu) — `js/prescriptions.js`, `saveAndAddAnotherPrescription()`.
- **Provera duplih pacijenata po telefonu** — provereno, već je ranije implementirano i radi ispravno: `checkDuplicatePatient()`/`runDuplicateCheck()` u `js/patients.js` reaguje i na ime i na telefon nezavisno (`oninput` na sva tri polja), tako da ako se prvo unese ime bez poklapanja, a zatim telefon koji se poklapa sa postojećim pacijentom, upozorenje se ipak pojavljuje. Nikakva izmena nije bila potrebna.
- **Automatsko pamćenje cene stakla**: nova kolona `lens_catalog.default_price` (numeric, nullable — SQL primenjen direktno preko Supabase MCP). Kad se u polje "naziv stakla" unese naziv koji se tačno poklapa (case-insensitive) sa nazivom iz kataloga koji ima zapamćenu cenu, i polje "cena/kom" je još prazno, cena se automatski upiše (`js/orders.js`: `onLensNameInput()`, `knownLensPrices`). Cena se pamti/ažurira pri svakom čuvanju porudžbine (`updateLensPriceMemory()`) — lista cena se sama gradi i ostaje ažurna od danas pa nadalje, bez ručnog održavanja. Anna će naknadno poslati spisak najc̍ešćih stakala sa cenama za jednokratno popunjavanje početnih vrednosti (SQL upsert u `lens_catalog`).

⚠️ **Bezbednosna napomena (postojeća, ne uvedena ovom sesijom)**: Supabase advisor javlja da `public.lens_catalog` i `public.order_prescriptions` nemaju uključeno Row Level Security — anon ključ (u kodu na GitHub-u) trenutno može direktno čitati/menjati te dve tabele mimo CRM-a. Isto verovatno važi i za ostale tabele ovog projekta (`patients`, `prescriptions`, `orders`, `order_frames`, `order_lenses`, `installments`, `users`) — vidi TODO ispod. Nije ništa promenjeno bez dogovora — samo prosleđujem nalaz.

Zapušeno: `crm.html`, `js/utils.js`, `js/prescriptions.js`, `js/orders.js`, `js/nav.js`, `FIXES.md`.

## 2026-08-17 (deo 2 — uklonjeno polje Godine, datum recepta, prizma, krupnije čekboksove)

- **Uklonjeno polje "Godine"** iz forme pacijenta u potpunosti (input, prikaz na kartici pacijenta, Info tab, upozorenje o duplim pacijentima) — `crm.html`, `js/patients.js`. Kolona `patients.age` u bazi NIJE obrisana (samo se više ne koristi), da se ne izgubi istorijski podatak kod starih pacijenata.
- **Forma pacijenta — "Datum posete" premešten** na mesto gde je bilo "Godine" (odmah posle Prezimena), Telefon ide poslednji — `crm.html`.
- **Galočka TKT** sada je `enter-skip` — retko se čekira, Enter je više ne zaustavlja u lancu navigacije — `crm.html`.
- **Recept — dodat datum recepta**: novo polje "Datum" pored "Namena" (koristi postojeću kolonu `prescriptions.rx_date`, SQL je već bio primenjen ranije ali JS/HTML deo nije bio urađen). Podrazumevano: datum posete pacijenta ako se recept unosi odmah nakon kreiranja novog pacijenta (`pendingQuickAddDate`), inače današnji datum — uvek se može ručno promeniti, što je bitno kad se naknadno dodaje recept za stariju posetu starog pacijenta. U lancu "+ Dodaj još recept" datum se prenosi na sledeći recept (ista poseta). **Recepti u tabu Recepti, u odeljku Pregledi i u listi za povezivanje na porudžbini sada prikazuju i sortiraju po ovom datumu (rx_date), a ne po datumu unosa u bazu (created_at)** — rešava problem da su svi retroaktivno uneti stari pacijenti prikazivani sa današnjim (2026) datumom umesto datuma iz sveske. Pretraga po datumu u Pregledima takođe filtrira po `rx_date` — `crm.html`, `js/prescriptions.js`, `js/orders.js`.
- **Recept — dodata polja Prizma (OD/OS)**: nova kolona `prescriptions.od_prism` / `os_prism` (text, SQL primenjen preko Supabase MCP), polja su u rx-gridu pored Ax (OD/OS red), markirana `enter-skip` — retko se popunjavaju. Prikazuju se u kartici recepta i u receptu porudžbine samo ako su uneta, isto kao BC/DIA — `crm.html`, `js/prescriptions.js`, `js/orders.js`.
- **Recept — "Pregled izvršio/la" vraćen na kraj forme** (posle BC/DIA, pre Komentara) i redizajniran: "Klijentov recept" i "Ervin" u jednom redu (Enter prebacuje fokus između njih, Space čekira/otčekira — podrazumevano ponašanje za čekboksove u lancu navigacije), "Anna" i "Bojana" u sledećem redu i markirani `enter-skip` (retko se biraju, ne treba se na njima zaustavljati Enterom). Sami čekboksovi su znatno uvećani (28×28px, veliki klikljivi razmak oko teksta) — bilo je teško pogoditi mišem standardnu veličinu. Nova CSS klasa `.rx-checkbox-lg` — `crm.html`, `css/crm.css`.
- **Popap je proširen** (640px → 760px, uz `max-width:92vw` da ne pređe ekran) i vertikalni razmaci malo stegnuti (padding, margin-bottom na par mesta), da forma recepta staje na ekran bez (ili sa znatno manje) skrolovanja — `css/crm.css`.
- **Hitfix**: prilikom prve isporuke ovog dela izmena, `crm.html`/`css/crm.css` su bili zapušeni odmah, ali `js/patients.js`/`js/prescriptions.js`/`js/orders.js`/ovaj fajl su privremeno zaostali zbog istovremenog GitHub platform incidenta (API greške pri push-u) — u tom kratkom prozoru pacijenti se nisu mogli sačuvati (stari JS je tražio polje `patient-form-age` koje više ne postoji u HTML-u). Dozapušeno pojedinačno čim je GitHub API oporavljen.

Zapušeno: `crm.html`, `css/crm.css`, `js/patients.js`, `js/prescriptions.js`, `js/orders.js`, `FIXES.md`.

## 2026-08-18 (bagovi: procureno slovo posle prečice ё/Backquote, Enter posle cene stakla → pravo na Sačuvaj)

- **Bugfix — procureno slovo pri otvaranju "Novi pacijent" prečicom**: kad se fizički taster desno od "1" (Backquote — "ё" na RU rasporedu) drži i tek malo predugo (OS auto-repeat), poslednji repeat-event stizao je NAKON što je fokus već prebačen u prvo polje novootvorenog modala (`openModal()` fokusira async, kroz `setTimeout(0)`), i taj repeat-event nije bio presretnut (`preventDefault()` se ranije pozivao samo kad NIJE fokusirano polje) — pa se taj karakter upisivao u polje "Ime" pre nego što je Anna počela da kuca. Ispravljeno u `js/nav.js`: dodata provera `e.repeat` — ako se isti fizički taster i dalje drži dok je fokus već u polju otvorenog modala, taj repeat-event se guta (`preventDefault()`), bez ponovnog otvaranja modala i bez upisa u polje. Normalno kucanje (uključujući slovo "ё" u bilo kom drugom polju) i jednokratni pritisak prečice ostaju nepromenjeni.
- **Enter posle cene stakla → pravo na "Sačuvaj"**: u formi porudžbine, kad se za red stakla unese naziv koji ima zapamćenu cenu u katalogu (cena se automatski upiše) ili se cena ručno unese, Enter u polju "naziv stakla" ili "cena/kom" sada odmah fokusira dugme "Sačuvaj", umesto da prolazi kroz indeks/premaz/popust/kol. jedno po jedno kao ranije. Ako cena za taj red stakla još nije popunjena (nepoznato staklo, cena nije ni ručno uneta), Enter i dalje radi kao pre — ide na sledeće polje, da bi se cena mogla uneti. Novo: `handleLensEnterJump(e, i)` u `js/orders.js`, okačeno preko `onkeydown` na `lens-name-${i}` i `lens-price-${i}` (koristi `e.stopPropagation()` da izbegne dvostruku obradu sa postojećim `initEnterNavigation()` iz `js/utils.js`, koji ostaje nepromenjen).

Zapušeno: `js/nav.js`, `js/orders.js`, `FIXES.md`.

## 2026-08-18 (deo 2 — dopuna: ipak procurelo pri brzom pritisku prečice; Izrada+Popust u jednom redu)

- **Dopuna bugfixa za procurelo slovo**: Anna je potvrdila da se "‚" i dalje pojavljuje pri **brzom, jednokratnom** pritisku prečice (Backquote/"ё") — dakle uzrok NIJE (samo) OS auto-repeat iz prethodnog fixa. Pravi mehanizam: na nekim raspored/OS kombinacijama znak fizičkog tastera stiže u polje kroz IME/composition mehanizam (Chrome ga tada obeleži kao `inputType: "insertCompositionText"`/`"insertFromComposition"` ili `event.isComposing===true`), koji ide odvojeno od običnog keydown-a — `preventDefault()` na sam keydown ga ne može sprečiti, jer composition-commit stiže asinhrono, baš u trenutku kad `openModal()` (kroz `setTimeout(0)`) prebaci fokus u prvo polje novog popapa, pre nego što Anna stigne da pritisne ijedan pravi taster.
  Ispravljeno u `js/nav.js`: nova funkcija `guardAgainstLeakedShortcutChar()`, pozvana odmah posle `openAddPatientModal()`. Hvata prvi `input` event na polju "Ime" — ako taj event nosi obeležje composition-a (`isComposing` / `insertCompositionText` / `insertFromComposition`) i pre njega nije bilo pravog `keydown`-a u tom polju, vrednost polja se briše (jednom, tiho). Normalno kucanje — uključujući vrlo brzo kucanje odmah posle prečice — ostaje netaknuto, jer nosi pravi `keydown` pre `input` eventa. Prethodni `e.repeat`-guard iz prve dopune ovog dana ostaje (hvata poseban slučaj fizičkog držanja tastera), ovaj novi guard radi dodatno uz njega, ne zamenjuje ga.
- **Forma porudžbine — Izrada i Popust u istom redu**: polje "Izrada" premešteno iz svog reda na dnu bloka Okviri/Stakla u zajednički `.field-grid` red sa "Popust (%)" (koji je već bio ispod bloka Okviri/Stakla ili Kontaktna sočiva) — jedan red umesto dva, manje skrolovanja u formi. Vidljivost "Izrada" i dalje samo za naočare (kontrolisano kroz `#izrada-field-wrap`, prati se u `setOrderType()` u `js/orders.js` isto kao ranije `#glasses-fields`) — `crm.html`, `js/orders.js`.

Zapušeno: `js/nav.js`, `js/orders.js`, `crm.html`, `FIXES.md`.

## TODO (Security hardening — сделать перед сдачей в эксплуатацию)
- Закрыть прямое чтение таблицы `users` (сейчас password читается через select) — перенести логин на RPC/Edge Function
- Ужесточить RLS policies на `patients`, `prescriptions`, `orders`, `order_frames`, `order_lenses`, `installments`, `order_prescriptions`, `lens_catalog` (сейчас `using(true)` / без RLS — anon key технически может читать/писать всё напрямую)
- Рассмотреть хеширование паролей вместо plain text

## TODO (функционал)
- [ ] Обсудить дальнейшие доработки с Анной
- [ ] Списки namena для окон/стёкол (`PURPOSES` в utils.js: za daljinu/za blizinu/za kompjuter/za stalno nošenje/progresivna/bifokalna) и для recepata (za daljinu/za blizinu/za računar/progresivno/kontaktna sočiva) исторически разные наборы строк — из-за этого группировка в карточке заказа иногда не находит совпадение (напр. "za kompjuter" vs "za računar"). Стоит унифицировать оба списка на один общий набор значений
