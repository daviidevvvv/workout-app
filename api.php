<?php

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

// Log the incoming request for debugging
error_log("Request received: " . print_r($_GET, true));

define('BACKUP_DIR', 'backups/');
define('MAX_BACKUPS', 10); // Numero massimo di backup da mantenere

if (!is_dir(BACKUP_DIR)) {
    mkdir(BACKUP_DIR, 0777, true);
}

if (isset($_GET['action'])) {
    $action = $_GET['action'];

    if ($action == 'load') {
        if (file_exists('data.json')) {
            $data = file_get_contents('data.json');
            if (empty($data)) {
                $data = json_encode([]);
            }
            error_log("Data loaded successfully: " . $data);
            echo $data;
        } else {
            error_log("data.json file not found");
            echo json_encode([]);
        }
    } elseif ($action == 'save') {
        $input = file_get_contents('php://input');
        error_log("Input data: " . $input);  // Log the input data for debugging

        // Validate JSON input
        $data = json_decode($input, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            error_log("Invalid JSON input: " . json_last_error_msg());
            echo json_encode(['message' => 'Errore: dati JSON non validi']);
            exit;
        }

        // Backup current data.json
        if (file_exists('data.json')) {
            createBackup($input);
        }

        // Save new data
        if (file_put_contents('data.json', $input) === false) {
            error_log("Error saving data");
            echo json_encode(['message' => 'Errore nel salvataggio dei dati']);
        } else {
            error_log("Data saved successfully");
            echo json_encode(['message' => 'Dati salvati con successo']);
        }
    } else {
        error_log("Invalid action: " . $action);
        echo json_encode(['error' => 'Azione non valida']);
    }
} else {
    error_log("No action specified");
    echo json_encode(['error' => 'Nessuna azione specificata']);
}

function createBackup($data) {
    $timestamp = date('Y-m-d_H-i-s');
    $backupFile = BACKUP_DIR . "data_backup_$timestamp.json";
    file_put_contents($backupFile, $data);

    // Limita il numero di backup
    $backups = glob(BACKUP_DIR . '*.json');
    if (count($backups) > MAX_BACKUPS) {
        // Ordina i backup dal più vecchio al più nuovo
        usort($backups, function ($a, $b) {
            return filemtime($a) - filemtime($b);
        });
        // Elimina i backup in eccesso
        while (count($backups) > MAX_BACKUPS) {
            $oldest = array_shift($backups);
            unlink($oldest);
        }
    }
}

?>

