<?php
if (session_status() === PHP_SESSION_NONE) {
    ini_set('session.cookie_httponly', 1);
    ini_set('session.cookie_samesite', 'Lax');
    session_start();
}

$db_file = __DIR__ . '/database.db';

try {
    $pdo = new PDO("sqlite:" . $db_file);
    
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    
    $pdo->exec('PRAGMA foreign_keys = ON;');
    
} catch (\PDOException $e) {
    header('Content-Type: application/json');
    echo json_encode([
        'success' => false, 
        'error' => 'Не удалось подключиться к файлу database.db: ' . $e->getMessage()
    ]);
    exit;
}
