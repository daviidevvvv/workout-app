document.addEventListener('DOMContentLoaded', () => {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/service-worker.js')
            .then(registration => {
                console.log('Service Worker registered with scope:', registration.scope);
            })
            .catch(error => {
                console.log('Service Worker registration failed:', error);
            });
    }

    const lastPage = localStorage.getItem('lastPage');
    if (lastPage) {
        showPage(lastPage);
    } else {
        showPage('petto');
    }
    loadExercises();
    
    // Imposta la modalità scura di default
    let darkModeEnabled = JSON.parse(localStorage.getItem('darkMode'));
    if (darkModeEnabled === null) {
        darkModeEnabled = true; // Imposta la modalità scura di default se non è ancora stata salvata
    }
    document.body.classList.toggle('dark-mode', darkModeEnabled);
    updateModeIcon(darkModeEnabled);

    // Carica le note personali salvate
    const savedNotes = localStorage.getItem('personalNotes');
    if (savedNotes) {
        document.getElementById('personalNotes').value = savedNotes;
    }

    // Carica le note per ogni pagina
    ['petto', 'schiena', 'spalleBraccia', 'note'].forEach(pageId => {
        const savedPageNotes = localStorage.getItem(`notes-${pageId}`);
        if (savedPageNotes) {
            document.getElementById(`notes-${pageId}`).value = savedPageNotes;
        }
    });
});

let removedExercises = [];
let debounceTimer;
let exerciseCounter = 0;  // A counter to ensure unique IDs

let timerInterval;
let timerTime = 0;
let timerState = 0; // 0 = stopped, 1 = running, 2 = paused

async function fetchData() {
    try {
        const response = await fetch('api.php?action=load');
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching data:', error);
        alert('Failed to load data. Please try again.');
    }
}

async function saveData(data) {
    try {
        const response = await fetch('api.php?action=save', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        const result = await response.json();
        console.log('Data saved successfully:', result);
    } catch (error) {
        console.error('Error saving data:', error);
        alert('Failed to save data. Please try again.');
    }
}

function showPage(pageId) {
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    document.querySelectorAll('.menu-item').forEach(item => {
        item.classList.remove('active');
    });
    const page = document.getElementById(pageId);
    if (page) {
        page.classList.add('active');
    }
    const menuItem = document.querySelector(`.menu-item[onclick="showPage('${pageId}'); toggleMenu()"]`);
    if (menuItem) {
        menuItem.classList.add('active');
    }
    localStorage.setItem('lastPage', pageId);
}

function toggleMenu() {
    const menu = document.getElementById('menu');
    menu.classList.toggle('hidden');
    menu.classList.toggle('open');
}

function toggleInfo(infoId) {
    const info = document.getElementById(infoId);
    if (info) {
        info.style.display = info.style.display === 'block' ? 'none' : 'block';
    }
}

function createExerciseElement(exerciseId, pageId) {
    const infoId = `info-${exerciseId}`;
    const exerciseHTML = `
        <div class="exercise" id="${exerciseId}">
            <div class="exercise-header">
                <input type="text" placeholder="Nome Esercizio" style="font-weight: bold; width: calc(100% - 130px);" oninput="autoSave()">
                <div class="sets-select" style="width: 120px; text-align: right;">
                    Sets: <select onchange="updateSets('${exerciseId}', this.value)">
                        ${[...Array(11).keys()].map(i => `<option value="${i}">${i}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="exercise-controls">
                <div class="move-buttons">
                    <button class="move-button" onclick="moveExerciseUp('${exerciseId}')">↑</button>
                    <button class="move-button" onclick="moveExerciseDown('${exerciseId}')">↓</button>
                </div>
                <div class="date-time">
                    <span id="timestamp-${exerciseId}" class="timestamp"></span>
                </div>
                <div class="action-buttons">
                    <button class="info-btn" onclick="toggleInfo('${infoId}')">ℹ️</button>
                    <button class="remove-btn" onclick="removeExercise('${exerciseId}')">🗑️</button>
                    <button class="timestamp-btn" onclick="addTimestamp('${exerciseId}')">🕒</button>
                </div>
            </div>
            <div id="${infoId}" class="info">
                <textarea placeholder="Descrizione" style="min-height: 40px;" oninput="autoSave()"></textarea>
                <textarea placeholder="Suggerimenti" class="set-note" style="min-height: 40px;" oninput="autoSave()"></textarea>
                <input type="text" placeholder="Inserisci link" oninput="updateLink('${infoId}', this.value)"><a href="#" target="_blank" class="play-link" style="display:none;"></a>
            </div>
            <div class="sets"></div>
        </div>
    `;
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = exerciseHTML;
    return tempDiv.firstElementChild;
}

function addExercise(pageId) {
    const page = document.getElementById(pageId);
    const exercisesContainer = page.querySelector('.exercises');
    const exerciseId = `exercise-${pageId}-${Date.now()}-${exerciseCounter++}`;
    const exerciseElement = createExerciseElement(exerciseId, pageId);
    exercisesContainer.appendChild(exerciseElement);
    autoSave();
}

function updateLink(infoId, value) {
    const link = document.querySelector(`#${infoId} .play-link`);
    if (link) {
        if (value.trim() !== '') {
            if (!value.startsWith('http://') && !value.startsWith('https://')) {
                value = 'http://' + value;
            }
            link.href = value;
            link.style.display = 'inline';
            link.textContent = value;  // Visualizza il link come testo
        } else {
            link.style.display = 'none';
            link.textContent = '';  // Rimuove il testo del link se il campo è vuoto
        }
        autoSave();
    }
}

function removeExercise(exerciseId) {
    console.log(`Tentativo di rimozione esercizio con ID: ${exerciseId}`);
    if (confirm('Sei sicuro di voler rimuovere questo esercizio?')) {
        const exercise = document.getElementById(exerciseId);
        if (!exercise) {
            console.error(`Elemento con ID ${exerciseId} non trovato`);
            return;
        }
        console.log('Esercizio trovato:', exercise);
        removedExercises.push({
            html: exercise.outerHTML,
            data: getExerciseData(exerciseId)
        });
        exercise.parentElement.removeChild(exercise);
        console.log('Esercizio rimosso, salvando i dati...');
        autoSave();
    }
}

function undoRemove() {
    if (removedExercises.length > 0) {
        const lastRemoved = removedExercises.pop();
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = lastRemoved.html;
        const exercise = tempDiv.firstElementChild;
        const pageId = exercise.id.split('-')[1];
        const exercisesContainer = document.getElementById(pageId).querySelector('.exercises');
        exercisesContainer.appendChild(exercise);
        restoreExerciseData(exercise.id, lastRemoved.data);
        autoSave();
    }
}

function updateSets(exerciseId, sets) {
    const exercise = document.getElementById(exerciseId);
    const setsContainer = exercise.querySelector('.sets');
    const currentSets = setsContainer.querySelectorAll('.set');

    // Aggiungi nuovi set se necessario
    if (sets > currentSets.length) {
        for (let i = currentSets.length; i < sets; i++) {
            const setId = `set-${exerciseId}-${i}`;
            const newSetHTML = `
                <div class="set" id="${setId}">
                    <span>Set ${i + 1}: <select class="technique-select" onchange="autoSave()">
                        ${['Nessuna', 'Dropset', 'Rest Pause', 'Stripping', 'Riscaldamento', 'Backoff', 'WorkingSet', 'Metabolico'].map(option => `<option value="${option.toLowerCase()}">${option}</option>`).join('')}
                    </select>
                    <input type="text" placeholder="Note" class="set-note" oninput="autoSave()"></span>
                    <div>
                        <input type="text" placeholder="Peso" onblur="addUnitLabel(this, 'kg')">
                        <input type="text" placeholder="Ripetizioni" onblur="addUnitLabel(this, 'rip')">
                        <input type="text" placeholder="Recupero" onblur="addUnitLabel(this, 'sec')">
                    </div>
                </div>
            `;
            setsContainer.insertAdjacentHTML('beforeend', newSetHTML);
        }
    } 
    // Rimuovi set in eccesso se necessario
    else if (sets < currentSets.length) {
        for (let i = currentSets.length - 1; i >= sets; i--) {
            setsContainer.removeChild(currentSets[i]);
        }
    }
    
    autoSave();
}

function addUnitLabel(input, unit) {
    if (input.value !== '' && !input.value.endsWith(' ' + unit)) {
        input.value += ' ' + unit;
    }
    autoSave();
}

function moveExerciseUp(exerciseId) {
    const exercise = document.getElementById(exerciseId);
    const previousExercise = exercise.previousElementSibling;
    if (previousExercise) {
        exercise.parentNode.insertBefore(exercise, previousExercise);
        autoSave();
    }
}

function moveExerciseDown(exerciseId) {
    const exercise = document.getElementById(exerciseId);
    const nextExercise = exercise.nextElementSibling;
    if (nextExercise) {
        exercise.parentNode.insertBefore(nextExercise, exercise);
        autoSave();
    }
}

async function autoSave() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
        const exercises = getStoredExercises();
        exercises.totalWeightLifted = calculateTotalWeightLifted(exercises); // Calcola il peso totale sollevato
        await saveData(exercises);
    }, 300);  // Adjust the debounce delay as needed
}

// Calcola il peso totale sollevato per tutti gli esercizi
function calculateTotalWeightLifted(exercises) {
    let totalWeight = 0;
    for (const pageId in exercises) {
        exercises[pageId].forEach(exerciseData => {
            totalWeight += calculateTotalWeight(exerciseData);
        });
    }
    return totalWeight;
}

// Funzione per calcolare il peso totale sollevato in un set
function calculateTotalWeight(exerciseData) {
    return exerciseData.setsData.reduce((total, setData) => {
        const weight = parseFloat(setData.weight) || 0;
        const reps = parseInt(setData.reps) || 0;
        return total + (weight * reps);
    }, 0);
}

async function loadExercises() {
    const exercises = await fetchData();
    if (exercises) {
        for (const [pageId, exercisesList] of Object.entries(exercises)) {
            const page = document.getElementById(pageId);
            const exercisesContainer = page.querySelector('.exercises');
            exercisesContainer.innerHTML = '';  // Clear the container before adding new exercises
            exercisesList.forEach(exerciseData => {
                const exerciseId = `exercise-${pageId}-${Date.now()}-${exerciseCounter++}`;
                const exerciseElement = createExerciseElement(exerciseId, pageId);
                exercisesContainer.appendChild(exerciseElement);
                updateSets(exerciseId, exerciseData.sets);
                restoreExerciseData(exerciseId, exerciseData);
            });
        }
    }
}

// Funzione aggiornata per ottenere i dati degli esercizi
function getStoredExercises() {
    const exercises = {};
    document.querySelectorAll('.page').forEach(page => {
        const pageId = page.id;
        exercises[pageId] = [];
        page.querySelectorAll('.exercise').forEach(exercise => {
            exercises[pageId].push(getExerciseData(exercise.id));
        });
    });
    return exercises;
}

function getExerciseData(exerciseId) {
    const exercise = document.getElementById(exerciseId);
    const exerciseData = {
        name: exercise.querySelector('.exercise-header input[type="text"]').value,
        sets: exercise.querySelector('.exercise-header select').value,
        timestamp: exercise.querySelector('.date-time .timestamp').innerHTML,
        info: {
            description: exercise.querySelector('.info textarea[placeholder="Descrizione"]').value,
            suggestions: exercise.querySelector('.info textarea[placeholder="Suggerimenti"]').value,
            link: exercise.querySelector('.info input[placeholder="Inserisci link"]').value
        },
        setsData: []
    };
    exercise.querySelectorAll('.set').forEach(set => {
        exerciseData.setsData.push({
            weight: set.querySelector('input[placeholder="Peso"]').value,
            reps: set.querySelector('input[placeholder="Ripetizioni"]').value,
            rest: set.querySelector('input[placeholder="Recupero"]').value,
            technique: set.querySelector('.technique-select').value,
            note: set.querySelector('input.set-note').value
        });
    });
    return exerciseData;
}

function restoreExerciseData(exerciseId, data) {
    const exercise = document.getElementById(exerciseId);
    exercise.querySelector('.exercise-header input[type="text"]').value = data.name;
    exercise.querySelector('.exercise-header select').value = data.sets;
    exercise.querySelector('.date-time .timestamp').innerHTML = data.timestamp;
    exercise.querySelector('.info textarea[placeholder="Descrizione"]').value = data.info.description;
    exercise.querySelector('.info textarea[placeholder="Suggerimenti"]').value = data.info.suggestions;
    exercise.querySelector('.info input[placeholder="Inserisci link"]').value = data.info.link;
    updateLink(`info-${exerciseId}`, data.info.link); // Aggiorna il link visibile
    updateSets(exerciseId, data.sets);
    data.setsData.forEach((setData, index) => {
        const set = exercise.querySelectorAll('.set')[index];
        set.querySelector('input[placeholder="Peso"]').value = setData.weight;
        set.querySelector('input[placeholder="Ripetizioni"]').value = setData.reps;
        set.querySelector('input[placeholder="Recupero"]').value = setData.rest;
        set.querySelector('.technique-select').value = setData.technique;
        set.querySelector('input.set-note').value = setData.note || '';
        addUnitLabel(set.querySelector('input[placeholder="Peso"]'), 'kg');
        addUnitLabel(set.querySelector('input[placeholder="Ripetizioni"]'), 'rip');
        addUnitLabel(set.querySelector('input[placeholder="Recupero"]'), 'sec');
    });
}

function addTimestamp(exerciseId) {
    const timestampSpan = document.getElementById(`timestamp-${exerciseId}`);
    if (timestampSpan.innerHTML === '') {
        const now = new Date();
        const formattedDate = now.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
        const formattedTime = now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
        timestampSpan.innerHTML = `${formattedDate}<br>${formattedTime}`;
    } else {
        timestampSpan.innerHTML = '';
    }
    autoSave();
}

function handleTimerClick() {
    const timerWidget = document.getElementById('timerWidget');

    if (timerState === 0) {
        // Start the timer
        timerState = 1;
        timerInterval = setInterval(updateTimer, 1000);
        timerWidget.classList.remove('paused', 'reset');
        timerWidget.classList.add('running');
    } else if (timerState === 1) {
        // Pause the timer
        timerState = 2;
        clearInterval(timerInterval);
        timerWidget.classList.remove('running', 'reset');
        timerWidget.classList.add('paused');
    } else if (timerState === 2) {
        // Reset the timer
        timerState = 0;
        clearInterval(timerInterval);
        timerTime = 0;
        timerWidget.innerText = '00:00';
        timerWidget.classList.remove('running', 'paused');
        timerWidget.classList.add('reset');
    }
}

function updateTimer() {
    timerTime++;
    const minutes = String(Math.floor(timerTime / 60)).padStart(2, '0');
    const seconds = String(timerTime % 60).padStart(2, '0');
    document.getElementById('timerWidget').innerText = `${minutes}:${seconds}`;
}

function toggleDarkMode() {
    const darkModeEnabled = document.body.classList.toggle('dark-mode');
    document.querySelectorAll('.exercise').forEach(exercise => {
        exercise.classList.toggle('dark-mode', darkModeEnabled);
    });
    localStorage.setItem('darkMode', darkModeEnabled);
    updateModeIcon(darkModeEnabled);
}

function updateModeIcon(darkModeEnabled) {
    const modeIcon = document.getElementById('modeIcon');
    if (darkModeEnabled) {
        modeIcon.src = 'moon-icon.png';
        modeIcon.alt = 'Modalità Scura';
    } else {
        modeIcon.src = 'sun-icon.png';
        modeIcon.alt = 'Modalità Chiara';
    }
}

function saveNotes(pageId) {
    const notes = document.getElementById(`notes-${pageId}`).value;
    localStorage.setItem(`notes-${pageId}`, notes);
}

/* Funzione per il calcolo del 70%
   Questa funzione legge il valore del peso e delle ripetizioni
   dalla sezione "Calcolo 70%" e calcola il risultato come:
   risultato = peso * (1 + 0.0333 * ripetizioni) * 0.7
*/
function calcola() {
    const peso = parseFloat(document.getElementById("peso").value);
    const ripetizioni = parseInt(document.getElementById("ripetizioni").value);
    
    if (isNaN(peso) || isNaN(ripetizioni)) {
        document.getElementById("risultato").innerHTML = "Inserisci valori validi.";
        return;
    }
    
    const risultato = peso * (1 + 0.0333 * ripetizioni) * 0.7;
    document.getElementById("risultato").innerHTML = `Risultato: ${risultato.toFixed(2)}`;
}
