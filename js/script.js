const fileInput = document.getElementById('fileInput');
const dropZone = document.getElementById('dropZone');
const matrixSection = document.getElementById('matrixSection');
const tableContainer = document.getElementById('tableContainer');
const analysisContainer = document.getElementById('analysisContainer');
const btnPdf = document.getElementById('btnExportPdf');

// Event Listeners
fileInput.addEventListener('change', () => { if (fileInput.files[0]) processFile(fileInput.files[0]); });
dropZone.addEventListener('dragover', e => { e.preventDefault(); });
dropZone.addEventListener('drop', e => { e.preventDefault(); processFile(e.dataTransfer.files[0]); });

// --- GENERAZIONE PDF ---
async function generatePDF() {
    const { jsPDF } = window.jspdf;
    const btn = document.getElementById('btnExportPdf');
    btn.disabled = true;
    btn.innerText = "Generazione in corso...";

    try {
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pageWidth = 210;
        const pageHeight = 297;
        const margin = 10;
        const contentWidth = pageWidth - (margin * 2);

        const sections = [
            { id: 'matrixWrapper' },
            { id: 'secondPageWrapper' }
        ];

        for (let i = 0; i < sections.length; i++) {
            const element = document.getElementById(sections[i].id);

            const canvas = await html2canvas(element, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff'
            });

            const imgData = canvas.toDataURL('image/png');
            const imgProps = pdf.getImageProperties(imgData);
            const imgHeight = (imgProps.height * contentWidth) / imgProps.width;

            let finalImgHeight = imgHeight;
            let finalImgWidth = contentWidth;

            if (imgHeight > (pageHeight - margin * 2)) {
                const ratio = (pageHeight - margin * 2) / imgHeight;
                finalImgHeight = imgHeight * ratio;
                finalImgWidth = contentWidth * ratio;
            }

            if (i > 0) pdf.addPage();

            const xOffset = margin + (contentWidth - finalImgWidth) / 2;
            pdf.addImage(imgData, 'PNG', xOffset, margin, finalImgWidth, finalImgHeight);
        }

        pdf.save('Analisi_Sociometrica.pdf');
    } catch (err) {
        console.error(err);
        alert("Errore durante la creazione del PDF.");
    } finally {
        btn.disabled = false;
        btn.innerText = "📄 Salva in PDF";
    }
}

// --- UTILS PARSING ---
function parseCSVLine(line) {
    const result = []; let cur = ''; let inQuote = false;
    for (let i = 0; i < line.length; i++) {
        if (line[i] === '"') inQuote = !inQuote;
        else if (line[i] === ',' && !inQuote) { result.push(cur.trim()); cur = ''; }
        else cur += line[i];
    }
    result.push(cur.trim()); return result;
}

function parseNums(str) {
    if (!str) return [];
    return str.split(/[\s,]+/).map(s => parseInt(s)).filter(n => !isNaN(n));
}

function processFile(file) {
    const reader = new FileReader();
    reader.onload = e => buildMatrix(e.target.result);
    reader.readAsText(file, 'UTF-8');
}

// --- LOGICA MATRICE ---
function buildMatrix(csv) {
    const rawLines = csv.split(/\r?\n/).filter(l => l.trim());
    let startIdx = isNaN(parseInt(parseCSVLine(rawLines[0])[0])) ? 1 : 0;

    const students = [];
    for (let i = startIdx; i < rawLines.length; i++) {
        const cols = parseCSVLine(rawLines[i]);
        if (cols.length < 3) continue;
        students.push({
            n: parseInt(cols[0]),
            name: `${cols[1]} ${cols[2]}`.trim(),
            prefs: parseNums(cols[3] || ''),
            rifiuti: parseNums(cols[4] || '')
        });
    }
    students.sort((a, b) => a.n - b.n);

    const prefRic = {}, rifRic = {}, chiLoHaScelto = {};
    students.forEach(s => {
        prefRic[s.n] = 0;
        rifRic[s.n] = 0;
        chiLoHaScelto[s.n] = [];
    });

    students.forEach(s => {
        s.prefs.forEach(p => { if (prefRic[p] !== undefined) { prefRic[p]++; chiLoHaScelto[p].push(s.n); } });
        s.rifiuti.forEach(r => { if (rifRic[r] !== undefined) rifRic[r]++; });
    });

    const totalPrefs = Object.values(prefRic).reduce((a,b) => a+b, 0);
    const avgPrefs = totalPrefs / students.length;
    const totalRif = Object.values(rifRic).reduce((a,b) => a+b, 0);
    const avgRif = totalRif / students.length;

    let html = '<table><thead><tr><th>#</th><th class="name-col">Studente</th>';
    students.forEach(s => html += `<th>${s.n}</th>`);
    html += '</tr></thead><tbody>';

    students.forEach(s => {
        html += `<tr><td>${s.n}</td><td class="name-col">${s.name}</td>`;
        students.forEach(t => {
            if (t.n === s.n) html += '<td class="self-cell"></td>';
            else if (s.prefs.includes(t.n)) html += '<td class="mark-v">✔</td>';
            else if (s.rifiuti.includes(t.n)) html += '<td class="mark-x">✘</td>';
            else html += '<td></td>';
        });
        html += '</tr>';
    });

    html += `<tr class="total-row"><td></td><td>Preferenze Ricevute</td>`;
    students.forEach(s => html += `<td>${prefRic[s.n]}</td>`);
    html += `</tr><tr class="total-row"><td></td><td>Rifiuti Ricevuti</td>`;
    students.forEach(s => html += `<td>${rifRic[s.n]}</td>`);
    html += '</tr></tbody></table>';
    tableContainer.innerHTML = html;

    if (students.length > 23) {
        tableContainer.classList.add('compact-table');
    } else {
        tableContainer.classList.remove('compact-table');
    }

    const profili = { leader: [], popolare: [], accettato: [], controverso: [], rifiutato: [], isolato: [] };
    const powerScores = {};
    students.forEach(s => {
        let score = 0;
        chiLoHaScelto[s.n].forEach(idChiSceglie => { score += prefRic[idChiSceglie]; });
        powerScores[s.n] = score;
    });
    const maxPower = Math.max(...Object.values(powerScores));

    students.forEach(s => {
        const p = prefRic[s.n];
        const r = rifRic[s.n];
        const power = powerScores[s.n];

        if (p === 0 && r === 0) profili.isolato.push(s.name);
        else if (p > avgPrefs && r > avgRif) profili.controverso.push(s.name);
        else if (p > avgPrefs && power >= maxPower * 0.8 && power > 0) profili.leader.push(s.name);
        else if (p > avgPrefs) profili.popolare.push(s.name);
        else if (r > avgRif) profili.rifiutato.push(s.name);
        else profili.accettato.push(s.name);
    });

    const renderList = (list) => list.length ? list.join(', ') : '<span class="empty-msg">Nessun soggetto rilevato</span>';

    analysisContainer.innerHTML = `
        <div class="profile-card p-leader">
            <div class="profile-title">🟣 LEADER</div>
            <div class="profile-desc">Il più riconosciuto dal gruppo. L'influenza si esercita su molti soggetti poiché scelto da persone a loro volta molto scelte.</div>
            <div class="profile-list">${renderList(profili.leader)}</div>
        </div>
        <div class="profile-card p-popolare">
            <div class="profile-title">🔵 POPOLARE</div>
            <div class="profile-desc">Considerato da molti (preferenze sopra la media), ma ha legami meno influenti rispetto al leader.</div>
            <div class="profile-list">${renderList(profili.popolare)}</div>
        </div>
        <div class="profile-card p-accettato">
            <div class="profile-title">🟢 ACCETTATO</div>
            <div class="profile-desc">Preferenze nella media o poco sopra e pochi rifiuti ricevuti.</div>
            <div class="profile-list">${renderList(profili.accettato)}</div>
        </div>
        <div class="profile-card p-controverso">
            <div class="profile-title">🟡 CONTROVERSO</div>
            <div class="profile-desc">Soggetto che divide il gruppo: riceve molte scelte ma anche molti rifiuti.</div>
            <div class="profile-list">${renderList(profili.controverso)}</div>
        </div>
        <div class="profile-card p-rifiutato">
            <div class="profile-title">🔴 RIFIUTATO</div>
            <div class="profile-desc">Riceve poche scelte e un numero di rifiuti superiore alla media.</div>
            <div class="profile-list">${renderList(profili.rifiutato)}</div>
        </div>
        <div class="profile-card p-isolato">
            <div class="profile-title">⚪ ISOLATO</div>
            <div class="profile-desc">Nessuna preferenza ricevuta, ma nessun rifiuto. Non instaura legami visibili.</div>
            <div class="profile-list">${renderList(profili.isolato)}</div>
        </div>
    `;

    matrixSection.style.display = 'block';
    btnPdf.style.display = 'inline-block';
    matrixSection.scrollIntoView({ behavior: 'smooth' });
    drawSociogram(students, prefRic, rifRic);
}

// --- SOCIOGRAMMA ---
function drawSociogram(students, prefRic, rifRic) {
    const container = document.getElementById('sociogramContainer');
    const canvas = document.getElementById('sociogramCanvas');
    const W = container.offsetWidth || 700;
    const H = Math.max(500, W * 0.75);
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);

    const n = students.length;
    const cx = W / 2, cy = H / 2;
    const R = Math.min(W, H) * 0.36;
    const nodeR = Math.max(22, Math.min(34, 180 / n));

    const pos = {};
    students.forEach((s, i) => {
        const angle = (2 * Math.PI * i / n) - Math.PI / 2;
        pos[s.n] = { x: cx + R * Math.cos(angle), y: cy + R * Math.sin(angle) };
    });

    function drawArrow(from, to, color, dashed) {
        const dx = to.x - from.x, dy = to.y - from.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < 1) return;
        const ux = dx/dist, uy = dy/dist;
        const sx = from.x + ux * nodeR;
        const sy = from.y + uy * nodeR;
        const ex = to.x - ux * (nodeR + 7);
        const ey = to.y - uy * (nodeR + 7);
        ctx.save();
        ctx.strokeStyle = color; ctx.lineWidth = 1.5;
        if (dashed) ctx.setLineDash([6, 3]);
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
        const headLen = 9; const angle = Math.atan2(ey - sy, ex - sx);
        ctx.setLineDash([]); ctx.fillStyle = color;
        ctx.beginPath(); ctx.moveTo(ex, ey);
        ctx.lineTo(ex - headLen * Math.cos(angle - 0.4), ey - headLen * Math.sin(angle - 0.4));
        ctx.lineTo(ex - headLen * Math.cos(angle + 0.4), ey - headLen * Math.sin(angle + 0.4));
        ctx.closePath(); ctx.fill(); ctx.restore();
    }

    students.forEach(s => {
        s.prefs.forEach(p => { if (pos[s.n] && pos[p]) drawArrow(pos[s.n], pos[p], '#28a745', false); });
        s.rifiuti.forEach(r => { if (pos[s.n] && pos[r]) drawArrow(pos[s.n], pos[r], '#dc3545', true); });
    });

    students.forEach(s => {
        const p = pos[s.n];
        const recv = prefRic[s.n] || 0;
        let fillColor = '#e9ecef', strokeColor = '#adb5bd';
        if (recv === 0) { fillColor = '#f8f9fa'; strokeColor = '#adb5bd'; }
        else if (recv >= 3) { fillColor = '#cce5ff'; strokeColor = '#004085'; }
        else { fillColor = '#d4edda'; strokeColor = '#155724'; }
        ctx.beginPath(); ctx.arc(p.x, p.y, nodeR, 0, 2 * Math.PI);
        ctx.fillStyle = fillColor; ctx.fill();
        ctx.strokeStyle = strokeColor; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = strokeColor; ctx.font = `bold ${Math.round(nodeR * 0.55)}px sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(s.n, p.x, p.y - 4);
        const parts = s.name.split(' ');
        const label = parts[0] + (parts[1] ? ' ' + parts[1][0] + '.' : '');
        ctx.font = `${Math.round(nodeR * 0.42)}px sans-serif`; ctx.fillStyle = '#333';
        ctx.fillText(label.length > 12 ? label.substring(0,11)+'…' : label, p.x, p.y + nodeR + 12);
    });
}
