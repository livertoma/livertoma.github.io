// Globala variabler för att lagra CSV-data
let taxRates = [];
let taxTables = [];
let kommuner = new Set();
let forsamlingar = {};
let borrowers = []; // Array för att lagra lånetagare

// Ladda CSV-filer
async function loadCSVFiles() {
    try {
        const [taxRatesResponse, taxTablesResponse] = await Promise.all([
            fetch('tax-rates.csv'),
            fetch('tax-tables.csv')
        ]);

        const taxRatesText = await taxRatesResponse.text();
        const taxTablesText = await taxTablesResponse.text();

        taxRates = parseCSV(taxRatesText);
        taxTables = parseCSV(taxTablesText);

        // Processa data
        processTaxRates();
        populateKommuner();
    } catch (error) {
        console.error('Fel vid inläsning av CSV-filer:', error);
    }
}

// CSV-parser
function parseCSV(text) {
    const lines = text.split('\n');
    const headers = lines[0].split(';');
    return lines.slice(1).map(line => {
        const values = line.split(';');
        return headers.reduce((obj, header, i) => {
            obj[header] = values[i];
            return obj;
        }, {});
    });
}

// Processera skattesatser
function processTaxRates() {
    taxRates.forEach(row => {
        const kommun = row['Kommun'];
        const forsamling = row['Församling'];
        kommuner.add(kommun);

        if (!forsamlingar[kommun]) {
            forsamlingar[kommun] = [];
        }
        forsamlingar[kommun].push(forsamling);
    });
}

// Fyll i kommun-dropdown
function populateKommuner() {
    const kommunSelect = document.getElementById('kommun');
    kommuner.forEach(kommun => {
        const option = document.createElement('option');
        option.value = kommun;
        option.textContent = kommun;
        kommunSelect.appendChild(option);
    });
}

// Hantera kyrkoval
document.querySelectorAll('.toggle-button').forEach(button => {
    button.addEventListener('click', function () {
        // Ta bort active-klassen från alla knappar
        document.querySelectorAll('.toggle-button').forEach(btn => btn.classList.remove('active'));
        // Lägg till active-klassen på den klickade knappen
        this.classList.add('active');

        const forsamlingGroup = document.getElementById('forsamling-group');
        forsamlingGroup.style.display = this.dataset.value === 'ja' ? 'block' : 'none';
    });
});

// Uppdatera församlingsdropdown
document.getElementById('kommun').addEventListener('change', function (e) {
    const forsamlingSelect = document.getElementById('forsamling');
    forsamlingSelect.innerHTML = '<option value="">Välj församling</option>';

    if (e.target.value && forsamlingar[e.target.value]) {
        forsamlingar[e.target.value].forEach(forsamling => {
            const option = document.createElement('option');
            option.value = forsamling;
            option.textContent = forsamling;
            forsamlingSelect.appendChild(option);
        });
    }
});

// Event listeners för sliders
document.getElementById('handpenning').addEventListener('input', function (e) {
    document.getElementById('handpenning-value').textContent = e.target.value + '%';
    updateHandpenning();
});

document.getElementById('ranta').addEventListener('input', function (e) {
    document.getElementById('ranta-value').textContent = e.target.value + '%';
    calculate();
});

// Beräkna handpenning i SEK
function updateHandpenning() {
    const bostadspris = parseFloat(document.getElementById('bostadspris').value) || 0;
    const handpenningProcent = parseFloat(document.getElementById('handpenning').value) || 15;
    const handpenningSEK = (bostadspris * handpenningProcent / 100).toLocaleString('sv-SE');
    document.getElementById('handpenning-sek').textContent = `${handpenningSEK} SEK`;
}

// Event listeners för input-fält
document.getElementById('bostadspris').addEventListener('input', updateHandpenning);
document.getElementById('handpenning').addEventListener('input', updateHandpenning);

// Beräkna nettolön
function calculateNetSalary(bruttolon, kommun, forsamling) {
    // Hitta rätt skattesats baserat på kommun och församling
    const taxRate = taxRates.find(row =>
        row['Kommun'] === kommun &&
        (forsamling ? row['Församling'] === forsamling : true)
    );

    console.log('Hittad skattesats:', taxRate);
    console.log('Kommun:', kommun);
    console.log('Församling:', forsamling);

    if (!taxRate) {
        console.error('Ingen skattesats hittades för kommun:', kommun, 'och församling:', forsamling);
        return bruttolon;
    }

    // Beräkna skattesatsen och hitta rätt tabellnummer baserat på om man är medlem i kyrkan eller inte
    const skattesatsString = forsamling ? taxRate['Summa, inkl. kyrkoavgift'] : taxRate['Summa, exkl. kyrkoavgift'];
    const skattesats = Math.round(parseFloat(skattesatsString.replace(',', '.')));
    console.log('Skattesats:', skattesats);

    // Tabellnummer baserat på skattesats
    const tabellnr = skattesats;
    console.log('Tabellnummer:', tabellnr);

    // Hitta rätt rad i skattetabellen baserat på bruttolönen
    const monthlySalary = bruttolon;
    const taxTable = taxTables.filter(row => row['Tabellnr'] === tabellnr.toString()).find(row => {
        const from = parseInt(row['Inkomst fr.o.m.']);
        const to = parseInt(row['Inkomst t.o.m.']);
        return monthlySalary >= from && monthlySalary <= to;
    });

    if (!taxTable) {
        console.error('Ingen skattetabell hittades för lönen:', monthlySalary, 'och tabellnummer:', tabellnr);
        return bruttolon;
    }

    // Använd kolumn 1 för skatten (löner till personer under 66 år med jobbskatteavdrag)
    const taxAmount = parseInt(taxTable['Kolumn 1']);
    console.log('Skatt från tabell:', taxAmount);

    // Beräkna nettolön
    const nettolon = bruttolon - taxAmount;
    console.log('Bruttolön:', bruttolon);
    console.log('Nettolön:', nettolon);

    return nettolon;
}

// Beräkna amortering
function calculateAmortization(lanebelopp, bostadspris, bruttolon) {
    // Beräkna belåningsgrad
    const belaningsgrad = (lanebelopp / bostadspris) * 100;

    // Beräkna skuldkvot (lån i förhållande till årsinkomst)
    const arsinkomst = bruttolon * 12;
    const skuldkvot = lanebelopp / arsinkomst;

    // Grundläggande amorteringskrav baserat på belåningsgrad
    let amorteringsProcent = 0;

    // Om belåningsgraden är över 70%
    if (belaningsgrad > 70) {
        amorteringsProcent = 2;
    }
    // Om belåningsgraden är över 50% men under 70%
    else if (belaningsgrad > 50) {
        amorteringsProcent = 1;
    }
    // Om belåningsgraden är under 50% och skuldkvoten är under 4.5
    else if (skuldkvot <= 4.5) {
        amorteringsProcent = 0; // Valfri amortering
    }

    // Extra amorteringskrav baserat på skuldkvot
    if (skuldkvot > 4.5) {
        amorteringsProcent += 1;
    }

    // Beräkna månadsvis amortering
    const arsAmortering = lanebelopp * (amorteringsProcent / 100);
    const manadsAmortering = arsAmortering / 12;

    console.log('Belåningsgrad:', belaningsgrad.toFixed(1) + '%');
    console.log('Skuldkvot:', skuldkvot.toFixed(1));
    console.log('Amorteringsprocent:', amorteringsProcent + '%');

    return {
        manadsAmortering,
        amorteringsProcent
    };
}

// Beräkna räntekostnad
function calculateInterest(lanebelopp, ranta) {
    return lanebelopp * (ranta / 100) / 12;
}

// Beräkna ränteavdrag
function calculateRanteavdrag(rantekostnad) {
    // Ränteavdrag är 30% av räntekostnaden upp till 100 000 SEK per år
    const arsRantekostnad = rantekostnad * 12;
    const maxArsRanteavdrag = 100000;
    const arsRanteavdrag = Math.min(arsRantekostnad, maxArsRanteavdrag) * 0.3;
    return arsRanteavdrag / 12; // Månadsvis ränteavdrag
}

// Funktion för att uppdatera församlingslistan
function updateForsamlingar(kommunSelect, forsamlingSelect) {
    const kommun = kommunSelect.value;
    forsamlingSelect.innerHTML = '<option value="">Välj församling</option>';

    if (kommun && forsamlingar[kommun]) {
        forsamlingar[kommun].forEach(forsamling => {
            const option = document.createElement('option');
            option.value = forsamling;
            option.textContent = forsamling;
            forsamlingSelect.appendChild(option);
        });
    }
}

// Funktion för att skapa en ny lånetagare
function createBorrowerCard() {
    const card = document.createElement('div');
    card.className = 'borrower-card';
    card.innerHTML = `
        <button class="remove-borrower" type="button">×</button>
        <div class="input-group">
            <label>Bruttolön</label>
            <div class="input-wrapper">
                <input type="number" class="bruttolon" placeholder="Ange bruttolön">
                <span class="input-suffix">SEK/månad</span>
            </div>
        </div>
        <div class="input-group">
            <label>Kommun</label>
            <select class="kommun">
                <option value="">Välj kommun</option>
                ${Array.from(kommuner).map(kommun =>
        `<option value="${kommun}">${kommun}</option>`
    ).join('')}
            </select>
        </div>
        <div class="input-group">
            <label>Medlem i kyrkan?</label>
            <div class="button-group">
                <button class="toggle-button active" data-value="ja">Ja</button>
                <button class="toggle-button" data-value="nej">Nej</button>
            </div>
        </div>
        <div class="input-group forsamling-group">
            <label>Församling</label>
            <select class="forsamling">
                <option value="">Välj församling</option>
            </select>
        </div>
    `;

    // Lägg till event listeners för den nya lånetagaren
    const kommunSelect = card.querySelector('.kommun');
    const forsamlingGroup = card.querySelector('.forsamling-group');
    const toggleButtons = card.querySelectorAll('.toggle-button');
    const forsamlingSelect = card.querySelector('.forsamling');

    // Lägg till event listener för kommunval
    kommunSelect.addEventListener('change', function () {
        updateForsamlingar(this, forsamlingSelect);
        calculate();
    });

    // Lägg till event listeners för kyrkoval
    toggleButtons.forEach(button => {
        button.addEventListener('click', function () {
            toggleButtons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            forsamlingGroup.style.display = this.dataset.value === 'ja' ? 'block' : 'none';
            calculate();
        });
    });

    // Lägg till event listener för församlingsval
    forsamlingSelect.addEventListener('change', calculate);

    // Lägg till event listener för bruttolön
    card.querySelector('.bruttolon').addEventListener('input', calculate);

    card.querySelector('.remove-borrower').addEventListener('click', function () {
        card.remove();
        calculate();
    });

    return card;
}

// Uppdatera beräkningsfunktionen för att hantera flera lånetagare
function calculate() {
    // Hämta input-värden för huvudlånetagaren
    const bruttolon = parseFloat(document.getElementById('bruttolon').value) || 0;
    const kommun = document.getElementById('kommun').value;
    const kyrka = document.querySelector('.toggle-button.active').dataset.value;
    const forsamling = kyrka === 'ja' ? document.getElementById('forsamling').value : null;
    const bostadspris = parseFloat(document.getElementById('bostadspris').value) || 0;
    const handpenningProcent = parseFloat(document.getElementById('handpenning').value) || 15;
    const ranta = parseFloat(document.getElementById('ranta').value) || 0;
    const driftkostnad = parseFloat(document.getElementById('driftkostnad').value) || 0;
    const avgift = parseFloat(document.getElementById('avgift').value) || 0;
    const ovrigaKostnader = parseFloat(document.getElementById('ovriga-kostnader').value) || 0;

    // Beräkna total bruttolön för alla lånetagare
    let totalBruttolon = bruttolon;
    const borrowerCards = document.querySelectorAll('.borrower-card');
    borrowerCards.forEach(card => {
        const borrowerBruttolon = parseFloat(card.querySelector('.bruttolon').value) || 0;
        totalBruttolon += borrowerBruttolon;
    });

    // Beräkna nettolön för huvudlånetagaren
    const nettolon = calculateNetSalary(bruttolon, kommun, forsamling);

    // Beräkna nettolön för varje ytterligare lånetagare
    let totalNettolon = nettolon;
    borrowerCards.forEach(card => {
        const borrowerBruttolon = parseFloat(card.querySelector('.bruttolon').value) || 0;
        const borrowerKommun = card.querySelector('.kommun').value;
        const borrowerKyrka = card.querySelector('.toggle-button.active').dataset.value;
        const borrowerForsamling = borrowerKyrka === 'ja' ? card.querySelector('.forsamling').value : null;
        const borrowerNettolon = calculateNetSalary(borrowerBruttolon, borrowerKommun, borrowerForsamling);
        totalNettolon += borrowerNettolon;
    });

    // Resten av beräkningarna...
    const handpenning = bostadspris * handpenningProcent / 100;
    const lanebelopp = bostadspris - handpenning;
    const rantekostnad = calculateInterest(lanebelopp, ranta);
    const ranteavdrag = calculateRanteavdrag(rantekostnad);
    const { manadsAmortering, amorteringsProcent } = calculateAmortization(lanebelopp, bostadspris, totalBruttolon);

    // Kontrollera om ränteavdrag ska inkluderas
    const includeRanteavdrag = document.getElementById('toggle-ranteavdrag').classList.contains('active');
    const totalKostnad = rantekostnad + manadsAmortering + driftkostnad + avgift + ovrigaKostnader - (includeRanteavdrag ? ranteavdrag : 0);
    const kvarEfterKostnader = totalNettolon - totalKostnad;

    // Uppdatera resultat
    document.getElementById('nettolon').textContent = `${totalNettolon.toLocaleString('sv-SE')} SEK`;
    document.getElementById('rantekostnad').textContent = `${rantekostnad.toLocaleString('sv-SE')} SEK`;
    document.getElementById('ranteavdrag').textContent = `${ranteavdrag.toLocaleString('sv-SE')} SEK`;
    document.getElementById('amortering').textContent = `${manadsAmortering.toLocaleString('sv-SE')} SEK (${amorteringsProcent}%)`;
    document.getElementById('kontantinsats').textContent = `${handpenning.toLocaleString('sv-SE')} SEK (${handpenningProcent}%)`;
    document.getElementById('total-kostnad').textContent = `${totalKostnad.toLocaleString('sv-SE')} SEK`;
    document.getElementById('kvar-efter-kostnader').textContent = `${kvarEfterKostnader.toLocaleString('sv-SE')} SEK`;

    // Uppdatera beräkningsförklaring
    document.getElementById('nettolon-formula').textContent = `${totalNettolon.toLocaleString('sv-SE')} SEK`;
    document.getElementById('lanebelopp-formula').textContent = `${lanebelopp.toLocaleString('sv-SE')} SEK`;
    document.getElementById('manadskostnad-formula').textContent = `${totalKostnad.toLocaleString('sv-SE')} SEK`;
    document.getElementById('ranteavdrag-formula').textContent = `${ranteavdrag.toLocaleString('sv-SE')} SEK`;
    document.getElementById('kvar-formula').textContent = `${kvarEfterKostnader.toLocaleString('sv-SE')} SEK`;
}

// Event listeners
document.getElementById('berakna').addEventListener('click', function () {
    // Visa resultatsektionen och beräkna
    document.querySelector('.result-section').style.display = 'block';
    calculate();
});

// Se till att resultatsektionen är dold från början
document.addEventListener('DOMContentLoaded', function () {
    document.querySelector('.result-section').style.display = 'none';
    document.getElementById('forsamling-group').style.display = 'block';

    // Initiera kollapsbar sektion
    const explanationSection = document.querySelector('.calculation-explanation');
    const expandableHeader = explanationSection.querySelector('.expandable-header');
    explanationSection.classList.add('collapsed');

    // Lägg till klickhändelse för att expandera/kollapsa
    expandableHeader.addEventListener('click', function (e) {
        explanationSection.classList.toggle('collapsed');
        explanationSection.classList.toggle('expanded');
    });

    // Förhindra att klick på innehållet stänger sektionen
    explanationSection.addEventListener('click', function (e) {
        if (!expandableHeader.contains(e.target)) {
            e.stopPropagation();
        }
    });
});

// Lägg till event listener för "Lägg till lånetagare"-knappen
document.getElementById('add-borrower').addEventListener('click', function () {
    const container = document.getElementById('additional-borrowers-container');
    const card = createBorrowerCard();
    container.appendChild(card);
    calculate();
});

// Lägg till event listeners för input-fält i huvudlånetagaren
document.getElementById('bruttolon').addEventListener('input', calculate);
document.getElementById('kommun').addEventListener('change', calculate);
document.getElementById('forsamling').addEventListener('change', calculate);
document.getElementById('bostadspris').addEventListener('input', calculate);
document.getElementById('handpenning').addEventListener('input', calculate);
document.getElementById('ranta').addEventListener('input', calculate);
document.getElementById('driftkostnad').addEventListener('input', calculate);
document.getElementById('avgift').addEventListener('input', calculate);
document.getElementById('ovriga-kostnader').addEventListener('input', calculate);

// Lägg till event listener för ränteavdragsknappen
document.getElementById('toggle-ranteavdrag').addEventListener('click', function () {
    this.classList.toggle('active');
    const isActive = this.classList.contains('active');
    this.querySelector('span').textContent = isActive ? 'Inkludera ränteavdrag' : 'Exkludera ränteavdrag';
    calculate();
});

// Ladda data när sidan laddas
document.addEventListener('DOMContentLoaded', loadCSVFiles); 