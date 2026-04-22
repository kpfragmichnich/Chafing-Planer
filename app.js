// --- State ---
let warmItems = [];
let templates = [];
let savedLayout = null; // Stores manual Drag & Drop layout

// --- History State (Undo/Redo) ---
let historyStack = [];
let historyIndex = -1;
let isRestoringHistory = false;

// Constants
const SIZE_MAP = {
    '12': '1/1',
    '6': '1/2',
    '4': '1/3',
    '3': '1/4'
};
const CHAFING_CAPACITY = {
    'Groß': 12,
    'Halb': 6
};

// --- DOM Elements ---
const btnAddTemplate = document.getElementById('btn-add-template');
const templateForm = document.getElementById('template-form');

const warmForm = document.getElementById('warm-form');
const warmCategorySelect = document.getElementById('warm-category');
const warmChafingSelect = document.getElementById('warm-chafing');
const warmSizeSelect = document.getElementById('warm-size');

// Meta Info Elements
const eventNameInput = document.getElementById('event-name');
const eventDateInput = document.getElementById('event-date');
const eventGuestsInput = document.getElementById('event-guests');
const printEventName = document.getElementById('print-event-name');
const printEventDate = document.getElementById('print-event-date');
const printEventGuests = document.getElementById('print-event-guests');

// --- Initialization ---
function init() {
    const savedTemplates = localStorage.getItem('chafing_templates');
    if (savedTemplates) {
        templates = JSON.parse(savedTemplates);
    } else {
        templates = [
            { id: 1, name: 'Gemischter Brotkorb & Butter', type: 'Kalt', checked: false },
            { id: 2, name: 'Räucherlachs-Platte', type: 'Kalt', checked: false },
            { id: 3, name: 'Tomate-Mozzarella', type: 'Kalt', checked: false },
            { id: 4, name: 'Mousse au Chocolat', type: 'Dessert', checked: false },
            { id: 5, name: 'Frischer Obstsalat', type: 'Dessert', checked: false }
        ];
        saveTemplates();
    }

    const savedWarmItems = localStorage.getItem('chafing_warm');
    if (savedWarmItems) {
        warmItems = JSON.parse(savedWarmItems);
    }

    setupEventHandlers();
    setupMetaHandlers();
    renderAll();

    commitState(); // initial state
}

// --- History & State Management ---
function parseLayoutFromDOM() {
    const blocks = [];
    document.querySelectorAll('.chafing-block').forEach(block => {
        const headerText = block.querySelector('.chafing-header span').textContent;
        const itemsDiv = block.querySelector('.chafing-items');
        const capacity = parseInt(itemsDiv.getAttribute('data-capacity') || 12);

        const itemIdsAndSizes = [];
        itemsDiv.querySelectorAll('.c-item').forEach(itemDiv => {
            itemIdsAndSizes.push({
                id: parseInt(itemDiv.getAttribute('data-id')),
                size: parseInt(itemDiv.getAttribute('data-size'))
            });
        });

        blocks.push({
            title: headerText,
            capacity: capacity,
            items: itemIdsAndSizes
        });
    });
    return blocks;
}

function commitState() {
    if (isRestoringHistory) return;

    const state = {
        meta: {
            name: eventNameInput.value,
            date: eventDateInput.value,
            guests: eventGuestsInput.value
        },
        warmItems: JSON.parse(JSON.stringify(warmItems)),
        templates: JSON.parse(JSON.stringify(templates)),
        layout: parseLayoutFromDOM()
    };

    if (historyIndex < historyStack.length - 1) {
        historyStack = historyStack.slice(0, historyIndex + 1);
    }

    historyStack.push(state);
    historyIndex++;
    updateHistoryButtons();
}

function updateHistoryButtons() {
    const undoBtn = document.getElementById('btn-undo');
    const redoBtn = document.getElementById('btn-redo');
    if (undoBtn) undoBtn.disabled = historyIndex <= 0;
    if (redoBtn) redoBtn.disabled = historyIndex >= historyStack.length - 1;
}

window.undo = function () {
    if (historyIndex > 0) {
        historyIndex--;
        restoreState(historyStack[historyIndex]);
    }
};

window.redo = function () {
    if (historyIndex < historyStack.length - 1) {
        historyIndex++;
        restoreState(historyStack[historyIndex]);
    }
};

function restoreState(state) {
    isRestoringHistory = true;

    eventNameInput.value = state.meta.name;
    eventDateInput.value = state.meta.date;
    eventGuestsInput.value = state.meta.guests;
    eventNameInput.dispatchEvent(new Event('input'));
    eventDateInput.dispatchEvent(new Event('input'));
    eventGuestsInput.dispatchEvent(new Event('input'));

    warmItems = JSON.parse(JSON.stringify(state.warmItems));
    templates = JSON.parse(JSON.stringify(state.templates));
    savedLayout = JSON.parse(JSON.stringify(state.layout));

    saveTemplates();
    saveWarmItems();
    renderAll();

    updateHistoryButtons();
    isRestoringHistory = false;
}

// --- Import / Export / Clear ---
window.exportPlan = function () {
    const currentState = {
        meta: {
            name: eventNameInput.value,
            date: eventDateInput.value,
            guests: eventGuestsInput.value
        },
        warmItems: warmItems,
        templates: templates,
        layout: parseLayoutFromDOM()
    };

    let cssText = '';
    try {
        for (let sheet of document.styleSheets) {
            for (let rule of sheet.cssRules) {
                cssText += rule.cssText + '\n';
            }
        }
    } catch (e) {
        console.warn("Could not read CSS rules", e);
    }

    const printHtml = document.getElementById('print-area').innerHTML;

    const htmlExport = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<title>${currentState.meta.name || 'Buffet Plan'}</title>
<style>
${cssText}
body { background: white; padding: 2rem; color: #1f2937; font-family: 'Inter', sans-serif; }
.no-print { display: none !important; }
.print-only { display: inline-block !important; }
.empty-state { color: #6b7280; font-style: italic; }
</style>
</head>
<body>
<div style="max-width: 1000px; margin: 0 auto;">
${printHtml}
</div>
<!-- HIDDEN APP STATE FOR IMPORT -->
<script id="chafing-save-state" type="application/json">
${JSON.stringify(currentState)}
</script>
</body>
</html>`;

    const dataStr = "data:text/html;charset=utf-8," + encodeURIComponent(htmlExport);
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    let fName = (currentState.meta.name || 'Buffet-Plan').replace(/\s+/g, '_');
    dlAnchorElem.setAttribute("download", fName + ".html");
    dlAnchorElem.click();
};

window.importPlan = function (event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const content = e.target.result;
            let state;

            // Versuche JSON aus dem HTML <script> Tag zu extrahieren
            const match = content.match(/<script id="chafing-save-state" type="application\/json">([\s\S]*?)<\/script>/);
            if (match && match[1]) {
                state = JSON.parse(match[1].trim());
            } else {
                // Fallback für alte .json oder .txt Dateien
                state = JSON.parse(content);
            }

            restoreState(state);
            isRestoringHistory = false;
            commitState();
            event.target.value = '';
        } catch (err) {
            alert("Fehler beim Laden der Datei! Ist es wirklich ein gültiger Plan?");
        }
    };
    reader.readAsText(file);
};

window.clearAllPrompt = function () {
    if (confirm("Möchtest du wirklich den gesamten Plan leeren?")) {
        clearAll();
        commitState();
    }
};

function clearAll() {
    warmItems = [];
    templates.forEach(t => t.checked = false);
    savedLayout = null;

    eventNameInput.value = '';
    eventDateInput.value = '';
    eventGuestsInput.value = '';
    eventNameInput.dispatchEvent(new Event('input'));
    eventDateInput.dispatchEvent(new Event('input'));
    eventGuestsInput.dispatchEvent(new Event('input'));

    saveWarmItems();
    saveTemplates();
    renderAll();
}

function setupMetaHandlers() {
    eventNameInput.addEventListener('input', (e) => {
        printEventName.innerText = e.target.value || 'Buffet Aufbau-Plan';
        localStorage.setItem('chafing_event_name', e.target.value);
    });

    eventDateInput.addEventListener('input', (e) => {
        if (e.target.value) {
            const dateObj = new Date(e.target.value);
            printEventDate.innerText = dateObj.toLocaleDateString('de-DE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        } else {
            printEventDate.innerText = '';
        }
        localStorage.setItem('chafing_event_date', e.target.value);
    });

    eventGuestsInput.addEventListener('input', (e) => {
        printEventGuests.innerText = e.target.value ? `👥 ${e.target.value} Personen` : '';
        localStorage.setItem('chafing_event_guests', e.target.value);
    });

    eventNameInput.addEventListener('change', commitState);
    eventDateInput.addEventListener('change', commitState);
    eventGuestsInput.addEventListener('change', commitState);

    if (localStorage.getItem('chafing_event_name')) {
        eventNameInput.value = localStorage.getItem('chafing_event_name');
        eventNameInput.dispatchEvent(new Event('input'));
    }
    if (localStorage.getItem('chafing_event_date')) {
        eventDateInput.value = localStorage.getItem('chafing_event_date');
        eventDateInput.dispatchEvent(new Event('input'));
    }
    if (localStorage.getItem('chafing_event_guests')) {
        eventGuestsInput.value = localStorage.getItem('chafing_event_guests');
        eventGuestsInput.dispatchEvent(new Event('input'));
    }
}

function setupEventHandlers() {
    btnAddTemplate.addEventListener('click', () => {
        templateForm.classList.toggle('hidden');
    });

    templateForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('template-name').value;
        const type = document.getElementById('template-type').value;

        templates.push({
            id: Date.now(),
            name: name,
            type: type,
            checked: true
        });
        document.getElementById('template-name').value = '';
        saveTemplates();

        savedLayout = parseLayoutFromDOM();
        renderAll();
        commitState();
    });

    warmCategorySelect.addEventListener('change', (e) => {
        if (e.target.value === 'Suppe') {
            warmChafingSelect.value = 'Suppe';
            warmSizeSelect.disabled = true;
            warmSizeSelect.value = '12';
        }
    });

    warmChafingSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val === 'Oval' || val === 'Suppe') {
            warmSizeSelect.disabled = true;
            warmSizeSelect.value = '12';
        } else {
            warmSizeSelect.disabled = false;
        }
        if (val === 'Suppe') {
            warmCategorySelect.value = 'Suppe';
        }
    });

    warmForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const item = {
            id: Date.now(),
            name: document.getElementById('warm-name').value,
            category: document.getElementById('warm-category').value,
            gnSize: document.getElementById('warm-size').value,
            chafingType: document.getElementById('warm-chafing').value
        };

        warmItems.push(item);
        document.getElementById('warm-name').value = '';
        saveWarmItems();

        savedLayout = null; // Auto-Pack für neue Gerichte aktivieren!
        renderAll();
        commitState();
    });

    window.addEventListener('beforeprint', () => {
        const printArea = document.getElementById('print-area').innerHTML;
        document.getElementById('real-print-area').innerHTML = printArea;
    });

    window.addEventListener('afterprint', () => {
        if (confirm("Drucken erfolgreich! Möchtest du den Plan leeren für die nächste Veranstaltung?")) {
            clearAll();
            commitState();
        }
    });
}

function saveTemplates() {
    localStorage.setItem('chafing_templates', JSON.stringify(templates));
}
function saveWarmItems() {
    localStorage.setItem('chafing_warm', JSON.stringify(warmItems));
}

window.toggleTemplate = function (id) {
    const t = templates.find(x => x.id === id);
    if (t) {
        t.checked = !t.checked;
        saveTemplates();
        savedLayout = parseLayoutFromDOM();
        renderAll();
        commitState();
    }
}

window.deleteTemplate = function (id) {
    if (confirm('Vorlage wirklich löschen?')) {
        templates = templates.filter(x => x.id !== id);
        saveTemplates();
        savedLayout = parseLayoutFromDOM();
        renderAll();
        commitState();
    }
}

window.deleteWarmItem = function (id) {
    warmItems = warmItems.filter(x => x.id !== id);
    saveWarmItems();
    savedLayout = null; // Auto-Pack Lücken füllen!
    renderAll();
    commitState();
}

// --- RENDERING ---
function renderAll() {
    renderWarmInputs();
    renderTemplatesList();
    renderPreview();
}

function renderWarmInputs() {
    const list = document.getElementById('warm-input-list');
    list.innerHTML = '';
    warmItems.forEach(item => {
        let sizeText = (item.chafingType === 'Oval' || item.chafingType === 'Suppe')
            ? '1 Ganz'
            : SIZE_MAP[item.gnSize];

        const li = document.createElement('li');
        li.innerHTML = `
            <div>
                <strong>${item.name}</strong> 
                <span style="color:#6b7280; font-size:0.85em;">(${sizeText} | ${item.chafingType})</span>
            </div>
            <button class="delete-btn" onclick="deleteWarmItem(${item.id})">&times;</button>
        `;
        list.appendChild(li);
    });
}

function renderTemplatesList() {
    const coldCon = document.getElementById('cold-templates');
    const dessertCon = document.getElementById('dessert-templates');
    coldCon.innerHTML = '';
    dessertCon.innerHTML = '';

    templates.forEach(t => {
        const div = document.createElement('div');
        div.className = 'checkbox-header';

        const label = document.createElement('label');
        label.className = 'checkbox-label';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = t.checked;
        checkbox.onchange = () => toggleTemplate(t.id);

        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(' ' + t.name));

        const delBtn = document.createElement('button');
        delBtn.className = 'delete-btn';
        delBtn.innerHTML = '&times;';
        delBtn.onclick = () => deleteTemplate(t.id);

        div.appendChild(label);
        div.appendChild(delBtn);

        if (t.type === 'Kalt') coldCon.appendChild(div);
        else dessertCon.appendChild(div);
    });
}

// --- Global Helper ---
function isValidGNCombination(sizesArray, maxCap) {
    let used = 0;
    let hasThirds = false;
    let hasHalvesQuarters = false;

    for (let s of sizesArray) {
        used += s;
        if (s === 4) hasThirds = true;
        if (s === 6 || s === 3) hasHalvesQuarters = true;
    }

    if (used > maxCap) return false;
    if (hasThirds && hasHalvesQuarters) return false;
    return true;
}

// --- Algorithm Core: Calculate Chafings ---
function calculateChafings(items) {
    const chafings = [];

    const ovalsAndSoups = items.filter(i => i.chafingType === 'Oval' || i.chafingType === 'Suppe');
    ovalsAndSoups.forEach(item => {
        chafings.push({
            type: item.chafingType,
            title: item.chafingType,
            capacity: 12,
            items: [item]
        });
    });

    const gnItems = items.filter(i => i.chafingType !== 'Oval' && i.chafingType !== 'Suppe');
    const pool = {};

    gnItems.forEach(item => {
        const isMeat = (item.category === 'Fleisch');
        const groupKey = isMeat ? `Fleisch_${item.chafingType}` : `Beilagen_${item.chafingType}`;

        if (!pool[groupKey]) pool[groupKey] = [];
        pool[groupKey].push(item);
    });

    let chafingCounter = 1;
    for (const key in pool) {
        const list = pool[key];
        const isGroß = key.includes('Groß');
        const chafingLabel = isGroß ? 'Groß' : 'Halb';
        const capacity = CHAFING_CAPACITY[isGroß ? 'Groß' : 'Halb'];

        let currentChafing = { type: chafingLabel, title: `${chafingLabel} ${chafingCounter}`, capacity: capacity, items: [], used: 0 };

        list.forEach(item => {
            let size = parseInt(item.gnSize);
            if (size > capacity) size = capacity;

            let currentSizes = currentChafing.items.map(i => {
                let s = parseInt(i.gnSize);
                return s > capacity ? capacity : s;
            });

            if (isValidGNCombination([...currentSizes, size], capacity)) {
                currentChafing.items.push(item);
                currentChafing.used += size;
            } else {
                chafings.push({ ...currentChafing });
                chafingCounter++;
                currentChafing = { type: chafingLabel, title: `${chafingLabel} ${chafingCounter}`, capacity: capacity, items: [item], used: size };
            }
        });

        if (currentChafing.items.length > 0) {
            chafings.push(currentChafing);
            chafingCounter++;
        }
    }

    return chafings;
}

// --- Render Preview ---
function renderPreview() {
    const warmContainer = document.getElementById('print-warm-chafings');
    warmContainer.innerHTML = '';

    if (warmItems.length === 0) {
        warmContainer.innerHTML = '<p class="empty-state">Noch keine warmen Speisen eingetragen.</p>';
    } else {
        let groupedChafings = [];

        if (savedLayout) {
            let usedItemIds = new Set();
            groupedChafings = savedLayout.map(block => {
                return {
                    title: block.title,
                    capacity: block.capacity,
                    items: block.items.map(savedItem => {
                        usedItemIds.add(savedItem.id);
                        let realItem = warmItems.find(x => x.id === savedItem.id);
                        return realItem ? { ...realItem, manualSize: savedItem.size } : null;
                    }).filter(Boolean)
                };
            });

            // Leftovers
            let leftovers = warmItems.filter(x => !usedItemIds.has(x.id));
            if (leftovers.length > 0) {
                groupedChafings = groupedChafings.concat(calculateChafings(leftovers));
            }
            // Filter out empty blocks
            groupedChafings = groupedChafings.filter(c => c.items.length > 0 || c.title.includes('Groß') || c.title.includes('Halb'));
        } else {
            groupedChafings = calculateChafings(warmItems);
        }

        groupedChafings.forEach(chafing => {
            const block = document.createElement('div');
            block.className = 'chafing-block';

            let itemsHtml = chafing.items.map(i => {
                let numSize = i.manualSize ? i.manualSize : ((i.chafingType === 'Oval' || i.chafingType === 'Suppe') ? 12 : parseInt(i.gnSize));
                let s = SIZE_MAP[numSize.toString()] || '1/1';

                let selectHtml = '';
                if (i.chafingType !== 'Oval' && i.chafingType !== 'Suppe') {
                    selectHtml = `
                        <select class="c-size-select no-print" onchange="updateItemSize(this)">
                            <option value="12" ${numSize === 12 ? 'selected' : ''}>1/1</option>
                            <option value="6" ${numSize === 6 ? 'selected' : ''}>1/2</option>
                            <option value="4" ${numSize === 4 ? 'selected' : ''}>1/3</option>
                            <option value="3" ${numSize === 3 ? 'selected' : ''}>1/4</option>
                        </select>
                    `;
                } else {
                    selectHtml = `<span class="c-size-select no-print" style="pointer-events: none;">1/1</span>`;
                }

                return `
                    <div class="c-item" data-id="${i.id}" data-size="${numSize}">
                        <span class="c-size print-only">${s}</span>
                        ${selectHtml}
                        <span class="c-name">${i.name}</span>
                        <span class="no-print" style="cursor: grab; color: #cbd5e1;">☰</span>
                    </div>
                `;
            }).join('');

            let cap = chafing.capacity || 12;

            block.innerHTML = `
                <div class="chafing-header">
                    <span>${chafing.title}</span>
                </div>
                <div class="chafing-items" data-capacity="${cap}" style="min-height: 40px;">
                    ${itemsHtml}
                </div>
            `;
            warmContainer.appendChild(block);
        });

        makeChafingsDraggable();
    }

    const coldCon = document.getElementById('print-cold-list');
    const dessertCon = document.getElementById('print-dessert-list');
    coldCon.innerHTML = '';
    dessertCon.innerHTML = '';

    const sortedTemplates = [...templates].sort((a, b) => a.id - b.id);

    const activeCold = sortedTemplates.filter(t => t.type === 'Kalt' && t.checked);
    const activeDessert = sortedTemplates.filter(t => t.type === 'Dessert' && t.checked);

    if (activeCold.length === 0) {
        coldCon.innerHTML = '<p class="empty-state">Keine Auswahl.</p>';
    } else {
        activeCold.forEach(t => {
            const li = document.createElement('li');
            li.textContent = t.name;
            coldCon.appendChild(li);
        });
    }

    if (activeDessert.length === 0) {
        dessertCon.innerHTML = '<p class="empty-state">Keine Auswahl.</p>';
    } else {
        activeDessert.forEach(t => {
            const li = document.createElement('li');
            li.textContent = t.name;
            dessertCon.appendChild(li);
        });
    }
}

// --- Drag & Drop Funktionalität für manuelles Verschieben ---
function makeChafingsDraggable() {
    const items = document.querySelectorAll('.c-item');
    const containers = document.querySelectorAll('.chafing-items');

    let draggedItem = null;

    items.forEach(item => {
        item.setAttribute('draggable', 'true');

        item.addEventListener('dragstart', function (e) {
            draggedItem = this;
            setTimeout(() => this.style.opacity = '0.5', 0);
        });

        item.addEventListener('dragend', function () {
            setTimeout(() => {
                this.style.opacity = '1';
                draggedItem = null;
            }, 0);
        });
    });

    containers.forEach(container => {
        container.addEventListener('dragover', function (e) {
            e.preventDefault();
            this.style.backgroundColor = '#f1f5f9';
        });

        container.addEventListener('dragleave', function (e) {
            this.style.backgroundColor = '';
        });

        container.addEventListener('drop', function (e) {
            e.preventDefault();
            this.style.backgroundColor = '';
            if (!draggedItem) return;

            const isSameContainer = this.contains(draggedItem);
            const sourceContainer = draggedItem.parentNode;
            const targetContainer = this;
            const targetItem = e.target.closest('.c-item');

            let swapHappened = false;

            if (isSameContainer) {
                if (targetItem && targetItem !== draggedItem) {
                    const rect = targetItem.getBoundingClientRect();
                    const offset = e.clientY - rect.top;
                    if (offset > rect.height / 2) {
                        targetContainer.insertBefore(draggedItem, targetItem.nextSibling);
                    } else {
                        targetContainer.insertBefore(draggedItem, targetItem);
                    }
                } else {
                    targetContainer.appendChild(draggedItem);
                }
                swapHappened = true;
            } else {
                let targetSizes = [];
                Array.from(targetContainer.children).forEach(child => {
                    if (child !== draggedItem) targetSizes.push(parseInt(child.getAttribute('data-size') || 0));
                });
                let draggedSize = parseInt(draggedItem.getAttribute('data-size') || 0);
                let targetMaxCap = parseInt(targetContainer.getAttribute('data-capacity') || 12);

                if (isValidGNCombination([...targetSizes, draggedSize], targetMaxCap)) {
                    if (targetItem && targetItem !== draggedItem) {
                        const rect = targetItem.getBoundingClientRect();
                        const offset = e.clientY - rect.top;
                        if (offset > rect.height / 2) {
                            targetContainer.insertBefore(draggedItem, targetItem.nextSibling);
                        } else {
                            targetContainer.insertBefore(draggedItem, targetItem);
                        }
                    } else {
                        targetContainer.appendChild(draggedItem);
                    }
                    swapHappened = true;
                } else {
                    if (targetItem && targetItem !== draggedItem) {
                        let targetSize = parseInt(targetItem.getAttribute('data-size') || 0);

                        let sourceSizes = [];
                        Array.from(sourceContainer.children).forEach(child => {
                            if (child !== draggedItem) sourceSizes.push(parseInt(child.getAttribute('data-size') || 0));
                        });
                        let sourceMaxCap = parseInt(sourceContainer.getAttribute('data-capacity') || 12);

                        let newTargetSizes = [];
                        Array.from(targetContainer.children).forEach(child => {
                            if (child !== draggedItem && child !== targetItem) newTargetSizes.push(parseInt(child.getAttribute('data-size') || 0));
                        });
                        newTargetSizes.push(draggedSize);

                        let newSourceSizes = [...sourceSizes, targetSize];

                        if (isValidGNCombination(newTargetSizes, targetMaxCap) && isValidGNCombination(newSourceSizes, sourceMaxCap)) {
                            const draggedNext = draggedItem.nextSibling;
                            targetContainer.insertBefore(draggedItem, targetItem);

                            if (draggedNext) {
                                sourceContainer.insertBefore(targetItem, draggedNext);
                            } else {
                                sourceContainer.appendChild(targetItem);
                            }
                            swapHappened = true;
                        } else {
                            alert("Tausch nicht möglich! Entweder Platzmangel oder du mischst 1/3 GN mit 1/2 bzw. 1/4 (das gibt Lücken).");
                        }
                    } else {
                        alert("Geht nicht! Entweder ist das Chafing voll, oder du versuchst 1/3 mit 1/2 bzw 1/4 zu mischen.");
                    }
                }
            }

            if (swapHappened) {
                savedLayout = parseLayoutFromDOM();
                commitState();
            }
        });
    });
}

window.updateItemSize = function (selectElem) {
    const newSize = parseInt(selectElem.value);
    const itemDiv = selectElem.closest('.c-item');
    const container = selectElem.closest('.chafing-items');

    let sizes = [];
    Array.from(container.children).forEach(child => {
        if (child !== itemDiv) {
            sizes.push(parseInt(child.getAttribute('data-size') || 0));
        }
    });
    let maxCap = parseInt(container.getAttribute('data-capacity') || 12);

    if (isValidGNCombination([...sizes, newSize], maxCap)) {
        itemDiv.setAttribute('data-size', newSize);
        const printSpan = itemDiv.querySelector('.c-size.print-only');
        if (printSpan) {
            printSpan.textContent = SIZE_MAP[newSize.toString()];
        }
        savedLayout = parseLayoutFromDOM();
        commitState();
    } else {
        alert("Größe kann nicht geändert werden! Das Chafing wäre überfüllt oder es entsteht ein Größen-Konflikt (1/3 gemischt mit 1/2 bzw 1/4).");
        selectElem.value = itemDiv.getAttribute('data-size');
    }
};

// Start
document.addEventListener('DOMContentLoaded', init);
