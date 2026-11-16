<?php

declare(strict_types=1);

$rootDir = dirname(__DIR__);
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/';

// 1. Раздача CSS и JS из папки /media/
if (str_starts_with($uri, '/media/')) {
    $filePath = realpath($rootDir . $uri);
    $mediaDir = realpath($rootDir . '/media');

    if ($filePath && $mediaDir && str_starts_with($filePath, $mediaDir) && is_file($filePath)) {
        $ext = pathinfo($filePath, PATHINFO_EXTENSION);
        $mime = match ($ext) {
            'css'   => 'text/css; charset=utf-8',
            'js'    => 'application/javascript; charset=utf-8',
            'png'   => 'image/png',
            'jpg', 'jpeg' => 'image/jpeg',
            'svg'   => 'image/svg+xml',
            default => 'application/octet-stream',
        };
        header("Content-Type: $mime");
        readfile($filePath);
        exit;
    }
    http_response_code(404);
    exit;
}

// 2. Раздача чистых .html страниц из папки /pages/
if ($uri === '/' || $uri === '/index.html') {
    header('Content-Type: text/html; charset=utf-8');
    readfile($rootDir . '/pages/index.html');
    exit;
}

if ($uri === '/profile.html') {
    header('Content-Type: text/html; charset=utf-8');
    readfile($rootDir . '/pages/profile.html');
    exit;
}

// 3. Подключаем конфигурацию и MVC-классы
require_once $rootDir . '/config/database.php';
require_once $rootDir . '/app/models/offermodel.php';
require_once $rootDir . '/app/models/requestmodel.php';
require_once $rootDir . '/app/models/usermodel.php';
require_once $rootDir . '/app/controller/offercontroller.php';
require_once $rootDir . '/app/controller/apicontroller.php';

$pdo = getDatabase();
$offerModel = new OfferModel($pdo);

// 4. Вывод карточек каталога через MVC (Controller -> Model::getActive() -> View)
if ($uri === '/offers/view') {
    $controller = new OfferController($offerModel);
    $controller->index();
    exit;
}

// 5. Обработка AJAX-запросов API (сохраняем совместимость с api.php)
if ($uri === '/api.php' || $uri === '/api') {
    $apiController = new ApiController(
        $offerModel,
        new RequestModel($pdo),
        new UserModel($pdo)
    );
    $apiController->handle((string)($_GET['action'] ?? ''));
    exit;
}

http_response_code(404);
echo '404 — Страница не найдена';
