<?php
header('Content-Type: application/json');
require_once 'config.php';

$action = $_GET['action'] ?? '';

// 1. Проверка сессии
if ($action === 'check_auth') {
    if (isset($_SESSION['user_id'])) {
        echo json_encode([
            'auth' => true, 
            'user_id' => $_SESSION['user_id'], 
            'name' => $_SESSION['first_name'] . ' ' . $_SESSION['last_name'],
            'group' => $_SESSION['group']
        ]);
    } else {
        echo json_encode(['auth' => false]);
    }
    exit;
}

// 2. Регистрация (first_name, last_name, group, email, password)
if ($action === 'register' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $first_name = trim($_POST['first_name'] ?? '');
    $last_name = trim($_POST['last_name'] ?? '');
    $group = trim($_POST['group'] ?? '');
    $email = trim($_POST['email'] ?? '');
    $raw_password = $_POST['password'] ?? '';

    if (empty($first_name) || empty($last_name) || empty($group) || empty($email) || empty($raw_password)) {
        echo json_encode(['success' => false, 'error' => 'Заполните все поля']);
        exit;
    }

    if (!preg_match('/^[а-яА-ЯёЁa-zA-Z\s\-]+$/u', $first_name) || !preg_match('/^[а-яА-ЯёЁa-zA-Z\s\-]+$/u', $last_name)) {
        echo json_encode(['success' => false, 'error' => 'Имя и фамилия должны содержать только буквы']);
        exit;
    }
    if (!preg_match('/^[а-яА-ЯёЁa-zA-Z0-9\s\-\.]+$/u', $group)) {
      echo json_encode(['success' => false, 'error' => 'Название группы содержит недопустимые символы']);
      exit;
  }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        echo json_encode(['success' => false, 'error' => 'Введите корректный Email']);
        exit;
    }

    if (mb_strlen($raw_password) < 6) {
        echo json_encode(['success' => false, 'error' => 'Пароль должен содержать минимум 6 символов']);
        exit;
    }

    $password_hash = password_hash($raw_password, PASSWORD_DEFAULT);

    try {
        $stmt = $pdo->prepare("INSERT INTO users (first_name, last_name, `group`, email, password_hash) VALUES (?, ?, ?, ?, ?)");
        $stmt->execute([$first_name, $last_name, $group, $email, $password_hash]);
        
        $_SESSION['user_id'] = $pdo->lastInsertId();
        $_SESSION['first_name'] = $first_name;
        $_SESSION['last_name'] = $last_name;
        $_SESSION['group'] = $group;
        echo json_encode(['success' => true]);
    } catch (PDOException $e) {
        echo json_encode(['success' => false, 'error' => 'Email уже зарегистрирован']);
    }
    exit;
}

// 3. Авторизация
if ($action === 'login' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $email = trim($_POST['email'] ?? '');
    $password = $_POST['password'] ?? '';

    $stmt = $pdo->prepare("SELECT * FROM users WHERE email = ?");
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    if ($user && password_verify($password, $user['password_hash'])) {
        $_SESSION['user_id'] = $user['id'];
        $_SESSION['first_name'] = $user['first_name'];
        $_SESSION['last_name'] = $user['last_name'];
        $_SESSION['group'] = $user['group'];
        echo json_encode(['success' => true]);
    } else {
        echo json_encode(['success' => false, 'error' => 'Неверный email или пароль']);
    }
    exit;
}

// 4. Выход
if ($action === 'logout') {
    session_destroy();
    echo json_encode(['success' => true]);
    exit;
}

// 5. Получить список категорий (для выпадающего списка при создании заявки)
if ($action === 'get_categories') {
    $stmt = $pdo->query("SELECT * FROM categories ORDER BY name ASC");
    echo json_encode(['success' => true, 'categories' => $stmt->fetchAll()]);
    exit;
}

// 6. Получить ТОЛЬКО ОТКРЫТЫЕ предложения помощи для КАТАЛОГА (с проверкой, откликался ли уже пользователь)
if ($action === 'get_offers') {
    $currentUserId = intval($_SESSION['user_id'] ?? 0);
    $sql = "SELECT o.*, c.name AS category_name, u.first_name, u.last_name, u.`group`,
            (SELECT COUNT(*) FROM requests r WHERE r.offer_id = o.id AND r.user_id = ?) AS already_replied
            FROM offers o 
            JOIN categories c ON o.category_id = c.id 
            JOIN users u ON o.user_id = u.id 
            WHERE o.status = 'open' 
            ORDER BY o.created_at DESC";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$currentUserId]);
    echo json_encode(['success' => true, 'offers' => $stmt->fetchAll()]);
    exit;
}



// 7. Создать предложение помощи (Заявку)
if ($action === 'create_offer' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!isset($_SESSION['user_id'])) { 
        echo json_encode(['success' => false, 'error' => 'Не авторизован']); 
        exit; 
    }
    
    $user_id = intval($_SESSION['user_id']);
    $category_id = intval($_POST['category_id'] ?? 0);
    $title = trim($_POST['title'] ?? '');
    $description = trim($_POST['description'] ?? '');

    if ($category_id <= 0 || empty($title) || empty($description)) {
        echo json_encode(['success' => false, 'error' => 'Выберите предмет и заполните все поля']);
        exit;
    }

    try {
        $stmt = $pdo->prepare("INSERT INTO offers (user_id, category_id, title, description, created_at, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)");
        $stmt->execute([$user_id, $category_id, $title, $description]);
        echo json_encode(['success' => true]);
    } catch (PDOException $e) {
        echo json_encode(['success' => false, 'error' => 'Ошибка БД: ' . $e->getMessage()]);
    }
    exit;
}

// 8. Откликнуться на чужую заявку (Создать Request с защитой от дублей)
if ($action === 'create_request' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!isset($_SESSION['user_id'])) { echo json_encode(['success' => false, 'error' => 'Не авторизован']); exit; }

    $userId = intval($_SESSION['user_id']);
    $offer_id = intval($_POST['offer_id'] ?? 0);
    $message = trim($_POST['message'] ?? '');

    if ($offer_id <= 0 || empty($message)) {
        echo json_encode(['success' => false, 'error' => 'Введите сообщение для отклика']);
        exit;
    }

    $checkStmt = $pdo->prepare("SELECT id FROM requests WHERE offer_id = ? AND user_id = ?");
    $checkStmt->execute([$offer_id, $userId]);
    if ($checkStmt->fetch()) {
        echo json_encode(['success' => false, 'error' => 'Вы уже откликнулись на эту заявку']);
        exit;
    }

    $stmt = $pdo->prepare("INSERT INTO requests (offer_id, user_id, message) VALUES (?, ?, ?)");
    $stmt->execute([$offer_id, $userId, $message]);
    echo json_encode(['success' => true]);
    exit;
}


// 9. Получить данные для личного кабинета (Профиль)
if ($action === 'get_profile_data') {
    if (!isset($_SESSION['user_id'])) { echo json_encode(['success' => false, 'error' => 'Не авторизован']); exit; }
    $userId = $_SESSION['user_id'];

    $stmtUser = $pdo->prepare("SELECT id, first_name, last_name, `group`, email FROM users WHERE id = ?");
    $stmtUser->execute([$userId]);
    $user_info = $stmtUser->fetch();

    $stmt1 = $pdo->prepare("SELECT o.*, c.name AS category_name FROM offers o JOIN categories c ON o.category_id = c.id WHERE o.user_id = ? ORDER BY o.created_at DESC");
    $stmt1->execute([$userId]);
    $my_offers = $stmt1->fetchAll();

    $stmt2 = $pdo->prepare("SELECT r.*, o.title AS offer_title, u.first_name, u.last_name, u.`group` 
                            FROM requests r 
                            JOIN offers o ON r.offer_id = o.id 
                            JOIN users u ON r.user_id = u.id 
                            WHERE o.user_id = ? ORDER BY r.created_at DESC");
    $stmt2->execute([$userId]);
    $incoming_requests = $stmt2->fetchAll();

    $stmt3 = $pdo->prepare("SELECT r.*, o.title AS offer_title, o.status AS offer_status, c.name AS category_name, u.first_name, u.last_name, u.`group` 
                            FROM requests r 
                            JOIN offers o ON r.offer_id = o.id 
                            JOIN categories c ON o.category_id = c.id
                            JOIN users u ON o.user_id = u.id 
                            WHERE r.user_id = ? ORDER BY r.created_at DESC");
    $stmt3->execute([$userId]);
    $outgoing_requests = $stmt3->fetchAll();

    echo json_encode([
        'success' => true,
        'user' => $user_info,
        'my_offers' => $my_offers,
        'incoming_requests' => $incoming_requests,
        'outgoing_requests' => $outgoing_requests
    ]);
    exit;
}


// 10. Обновление данных профиля (ФИ, группа, email, новый пароль)
if ($action === 'update_profile' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!isset($_SESSION['user_id'])) { echo json_encode(['success' => false, 'error' => 'Не авторизован']); exit; }
    
    $userId = $_SESSION['user_id'];
    $first_name = trim($_POST['first_name'] ?? '');
    $last_name = trim($_POST['last_name'] ?? '');
    $group = trim($_POST['group'] ?? '');
    $email = trim($_POST['email'] ?? '');

    if (empty($first_name) || empty($last_name) || empty($group) || empty($email)) {
        echo json_encode(['success' => false, 'error' => 'Заполните все поля']);
        exit;
    }

    if (!preg_match('/^[а-яА-ЯёЁa-zA-Z\s\-]+$/u', $first_name) || !preg_match('/^[а-яА-ЯёЁa-zA-Z\s\-]+$/u', $last_name)) {
        echo json_encode(['success' => false, 'error' => 'Имя и фамилия должны содержать только буквы']);
        exit;
    }

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        echo json_encode(['success' => false, 'error' => 'Некорректный формат Email']);
        exit;
    }

    try {
        $stmt = $pdo->prepare("UPDATE users SET first_name = ?, last_name = ?, `group` = ?, email = ? WHERE id = ?");
        $stmt->execute([$first_name, $last_name, $group, $email, $userId]);

        $_SESSION['first_name'] = $first_name;
        $_SESSION['last_name'] = $last_name;
        $_SESSION['group'] = $group;

        echo json_encode(['success' => true]);
    } catch (PDOException $e) {
        echo json_encode(['success' => false, 'error' => 'Этот Email уже занят другим пользователем']);
    }
    exit;
}

// 12. Отдельная смена пароля
if ($action === 'change_password' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!isset($_SESSION['user_id'])) { echo json_encode(['success' => false, 'error' => 'Не авторизован']); exit; }

    $userId = $_SESSION['user_id'];
    $old_password = $_POST['old_password'] ?? '';
    $new_password = $_POST['new_password'] ?? '';
    $confirm_password = $_POST['confirm_password'] ?? '';

    if (empty($old_password) || empty($new_password) || empty($confirm_password)) {
        echo json_encode(['success' => false, 'error' => 'Заполните все поля']);
        exit;
    }

    if (mb_strlen($new_password) < 6) {
        echo json_encode(['success' => false, 'error' => 'Новый пароль должен содержать минимум 6 символов']);
        exit;
    }
    if (!preg_match('/^[а-яА-ЯёЁa-zA-Z0-9\s\-\.]+$/u', $group)) {
      echo json_encode(['success' => false, 'error' => 'Название группы содержит недопустимые символы']);
      exit;
    }
    if ($new_password !== $confirm_password) {
        echo json_encode(['success' => false, 'error' => 'Новые пароли не совпадают']);
        exit;
    }

    $stmt = $pdo->prepare("SELECT password_hash FROM users WHERE id = ?");
    $stmt->execute([$userId]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($old_password, $user['password_hash'])) {
        echo json_encode(['success' => false, 'error' => 'Неверный текущий пароль']);
        exit;
    }

    $new_hash = password_hash($new_password, PASSWORD_DEFAULT);
    $updateStmt = $pdo->prepare("UPDATE users SET password_hash = ? WHERE id = ?");
    $updateStmt->execute([$new_hash, $userId]);

    echo json_encode(['success' => true]);
    exit;
}

// 11. Редактирование своей заявки (с обновлением даты изменения)
if ($action === 'update_offer' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!isset($_SESSION['user_id'])) { echo json_encode(['success' => false, 'error' => 'Не авторизован']); exit; }

    $offer_id = intval($_POST['offer_id'] ?? 0);
    $category_id = intval($_POST['category_id'] ?? 0);
    $title = trim($_POST['title'] ?? '');
    $description = trim($_POST['description'] ?? '');
    $status = ($_POST['status'] ?? 'open') === 'closed' ? 'closed' : 'open';

    if (empty($title) || empty($description) || $category_id <= 0) {
        echo json_encode(['success' => false, 'error' => 'Заполните все поля заявки']);
        exit;
    }

    $stmt = $pdo->prepare("UPDATE offers SET category_id = ?, title = ?, description = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?");
    $stmt->execute([$category_id, $title, $description, $status, $offer_id, $_SESSION['user_id']]);
    
    echo json_encode(['success' => true]);
    exit;
}

// 12. Удаление своей заявки
if ($action === 'delete_offer' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!isset($_SESSION['user_id'])) { 
        echo json_encode(['success' => false, 'error' => 'Не авторизован']); 
        exit; 
    }

    $offer_id = intval($_POST['offer_id'] ?? 0);
    $user_id = intval($_SESSION['user_id']);

    if ($offer_id <= 0) {
        echo json_encode(['success' => false, 'error' => 'Некорректный ID заявки']);
        exit;
    }

    $stmt = $pdo->prepare("DELETE FROM offers WHERE id = ? AND user_id = ?");
    $stmt->execute([$offer_id, $user_id]);

    echo json_encode(['success' => true]);
    exit;
}
?>