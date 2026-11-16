<?php

declare(strict_types=1);

class ApiController
{
    private OfferModel $offerModel;
    private RequestModel $requestModel;
    private UserModel $userModel;

    public function __construct(OfferModel $offerModel, RequestModel $requestModel, UserModel $userModel)
    {
        $this->offerModel = $offerModel;
        $this->requestModel = $requestModel;
        $this->userModel = $userModel;
    }

    /**
     * Отправка JSON-ответа и завершение скрипта
     */
    private function json(array $data, int $status = 200): void
    {
        header('Content-Type: application/json; charset=utf-8');
        http_response_code($status);
        echo json_encode($data, JSON_UNESCAPED_UNICODE);
        exit;
    }

    /**
     * Единый обработчик всех API-действий
     */
    public function handle(string $action): void
    {
        if ($_SERVER['REQUEST_METHOD'] === 'POST') {
            $clientToken = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? $_POST['csrf_token'] ?? '';
            $sessionToken = $_SESSION['csrf_token'] ?? '';

            if (empty($clientToken) || empty($sessionToken) || !hash_equals($sessionToken, $clientToken)) {
                $this->json([
                    'success' => false,
                    'error'   => 'Ошибка безопасности. Обновите страницу.'
                ], 403);
            }
        }

        try {
            match ($action) {
                'check_auth'       => $this->checkAuth(),
                'register'         => $this->register(),
                'login'            => $this->login(),
                'logout'           => $this->logout(),
                'get_categories'   => $this->getCategories(),
                'get_offers'       => $this->getOffers(),
                'create_offer'     => $this->createOffer(),
                'create_request'   => $this->createRequest(),
                'get_profile_data' => $this->getProfileData(),
                'update_profile'   => $this->updateProfile(),
                'change_password'  => $this->changePassword(),
                'update_offer'     => $this->updateOffer(),
                'delete_offer'     => $this->deleteOffer(),
                default            => $this->json(['success' => false, 'error' => 'Неизвестное действие'], 404),
            };
        } catch (PDOException $e) {
            error_log($e->getMessage());
            $message = 'Ошибка при работе с базой данных';

            if ($e->getCode() === '23000') {
                $message = 'Email уже зарегистрирован или занят другим пользователем';
            }

            $this->json(['success' => false, 'error' => $message], 500);
        } catch (Throwable $e) {
            error_log($e->getMessage());
            $this->json(['success' => false, 'error' => 'Внутренняя ошибка сервера'], 500);
        }
    }

    // 1. Проверка авторизации
    private function checkAuth(): void
    {
        if (isset($_SESSION['user_id'])) {
            $this->json([
                'auth'       => true,
                'user_id'    => $_SESSION['user_id'],
                'name'       => $_SESSION['first_name'] . ' ' . $_SESSION['last_name'],
                'group'      => $_SESSION['group'],
                'csrf_token' => $_SESSION['csrf_token'],
            ]);
        }

        $this->json([
            'auth'       => false,
            'csrf_token' => $_SESSION['csrf_token'],
        ]);
    }

    // 2. Регистрация
    private function register(): void
    {
        $this->requirePost();

        $firstName = trim($_POST['first_name'] ?? '');
        $lastName  = trim($_POST['last_name'] ?? '');
        $group     = trim($_POST['group'] ?? '');
        $email     = trim($_POST['email'] ?? '');
        $password  = $_POST['password'] ?? '';

        if (!$firstName || !$lastName || !$group || !$email || !$password) {
            $this->json(['success' => false, 'error' => 'Заполните все поля']);
        }

        if (
            !preg_match('/^[а-яА-ЯёЁa-zA-Z\s-]+$/u', $firstName) ||
            !preg_match('/^[а-яА-ЯёЁa-zA-Z\s-]+$/u', $lastName)
        ) {
            $this->json(['success' => false, 'error' => 'Имя и фамилия должны содержать только буквы']);
        }

        if (!preg_match('/^[а-яА-ЯёЁa-zA-Z0-9\s.-]+$/u', $group)) {
            $this->json(['success' => false, 'error' => 'Название группы содержит недопустимые символы']);
        }

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $this->json(['success' => false, 'error' => 'Введите корректный Email']);
        }

        if (mb_strlen($password) < 6) {
            $this->json(['success' => false, 'error' => 'Пароль должен содержать минимум 6 символов']);
        }

        $passwordHash = password_hash($password, PASSWORD_DEFAULT);
        $userId = $this->userModel->create($firstName, $lastName, $group, $email, $passwordHash);

        session_regenerate_id(true);
        $_SESSION['user_id']    = $userId;
        $_SESSION['first_name'] = $firstName;
        $_SESSION['last_name']  = $lastName;
        $_SESSION['group']      = $group;
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));

        $this->json([
            'success'    => true,
            'csrf_token' => $_SESSION['csrf_token'],
        ]);
    }

    // 3. Авторизация
    private function login(): void
    {
        $this->requirePost();

        $email    = trim($_POST['email'] ?? '');
        $password = $_POST['password'] ?? '';

        $user = $this->userModel->findByEmail($email);

        if (!$user || !password_verify($password, $user['password_hash'])) {
            $this->json(['success' => false, 'error' => 'Неверный email или пароль']);
        }

        session_regenerate_id(true);
        $_SESSION['user_id']    = $user['id'];
        $_SESSION['first_name'] = $user['first_name'];
        $_SESSION['last_name']  = $user['last_name'];
        $_SESSION['group']      = $user['group'];
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));

        $this->json([
            'success'    => true,
            'csrf_token' => $_SESSION['csrf_token'],
        ]);
    }

    // 4. Выход
    private function logout(): void
    {
        $this->requirePost();

        $_SESSION = [];
        session_destroy();

        $this->json(['success' => true]);
    }

    // 5. Получение категорий
    private function getCategories(): void
    {
        $this->json([
            'success'    => true,
            'categories' => $this->offerModel->getCategories(),
        ]);
    }

    // 6. Получение активных заявок
    private function getOffers(): void
    {
        $userId = (int)($_SESSION['user_id'] ?? 0);
        $offers = $this->offerModel->getActive($_GET, $userId);

        $this->json([
            'success' => true,
            'offers'  => $offers,
        ]);
    }
    // 7. Создание заявки
    private function createOffer(): void
    {
        $this->requirePost();
        $userId = $this->requireAuth();

        $categoryId  = (int)($_POST['category_id'] ?? 0);
        $type        = ($_POST['type'] ?? '') === 'can_help' ? 'can_help' : 'need_help';
        $title       = trim($_POST['title'] ?? '');
        $description = trim($_POST['description'] ?? '');

        if ($categoryId <= 0 || $title === '' || $description === '') {
            $this->json(['success' => false, 'error' => 'Выберите предмет и заполните все поля']);
        }

        $this->offerModel->create($userId, $categoryId, $type, $title, $description);

        $this->json(['success' => true]);
    }

    // 8. Отклик на заявку
    private function createRequest(): void
    {
        $this->requirePost();
        $userId = $this->requireAuth();

        $offerId = (int)($_POST['offer_id'] ?? 0);
        $message = trim($_POST['message'] ?? '');

        if ($offerId <= 0 || $message === '') {
            $this->json(['success' => false, 'error' => 'Введите сообщение для отклика']);
        }

        $offer = $this->offerModel->getById($offerId);

        if (!$offer) {
            $this->json(['success' => false, 'error' => 'Заявка не найдена']);
        }

        if ((int)$offer['user_id'] === $userId) {
            $this->json(['success' => false, 'error' => 'Нельзя откликнуться на собственную заявку']);
        }

        if ($offer['status'] !== 'open') {
            $this->json(['success' => false, 'error' => 'Заявка уже закрыта автором']);
        }

        if ($this->requestModel->exists($offerId, $userId)) {
            $this->json(['success' => false, 'error' => 'Вы уже откликнулись на эту заявку']);
        }

        $this->requestModel->create($offerId, $userId, $message);

        $this->json(['success' => true]);
    }

    // 9. Данные личного кабинета
    private function getProfileData(): void
    {
        $userId = $this->requireAuth();

        $user = $this->userModel->findById($userId);
        if ($user) {
            unset($user['password_hash']);
        }

        $this->json([
            'success'           => true,
            'user'              => $user,
            'my_offers'         => $this->offerModel->getByUser($userId),
            'incoming_requests' => $this->requestModel->getIncoming($userId),
            'outgoing_requests' => $this->requestModel->getOutgoing($userId),
        ]);
    }

    // 10. Обновление профиля
    private function updateProfile(): void
    {
        $this->requirePost();
        $userId = $this->requireAuth();

        $firstName = trim($_POST['first_name'] ?? '');
        $lastName  = trim($_POST['last_name'] ?? '');
        $group     = trim($_POST['group'] ?? '');
        $email     = trim($_POST['email'] ?? '');

        if ($firstName === '' || $lastName === '' || $group === '' || $email === '') {
            $this->json(['success' => false, 'error' => 'Заполните все поля']);
        }

        if (
            !preg_match('/^[а-яА-ЯёЁa-zA-Z\s-]+$/u', $firstName) ||
            !preg_match('/^[а-яА-ЯёЁa-zA-Z\s-]+$/u', $lastName)
        ) {
            $this->json(['success' => false, 'error' => 'Имя и фамилия должны содержать только буквы']);
        }

        if (!preg_match('/^[а-яА-ЯёЁa-zA-Z0-9\s.-]+$/u', $group)) {
            $this->json(['success' => false, 'error' => 'Название группы содержит недопустимые символы']);
        }

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $this->json(['success' => false, 'error' => 'Некорректный формат Email']);
        }

        $this->userModel->updateProfile($userId, $firstName, $lastName, $group, $email);

        $_SESSION['first_name'] = $firstName;
        $_SESSION['last_name']  = $lastName;
        $_SESSION['group']      = $group;

        $this->json(['success' => true]);
    }

    // 11. Смена пароля
    private function changePassword(): void
    {
        $this->requirePost();
        $userId = $this->requireAuth();

        $oldPassword     = $_POST['old_password'] ?? '';
        $newPassword     = $_POST['new_password'] ?? '';
        $confirmPassword = $_POST['confirm_password'] ?? '';

        if ($oldPassword === '' || $newPassword === '' || $confirmPassword === '') {
            $this->json(['success' => false, 'error' => 'Заполните все поля']);
        }

        if (mb_strlen($newPassword) < 6) {
            $this->json(['success' => false, 'error' => 'Новый пароль должен содержать минимум 6 символов']);
        }

        if ($newPassword !== $confirmPassword) {
            $this->json(['success' => false, 'error' => 'Новые пароли не совпадают']);
        }

        $user = $this->userModel->findById($userId);

        if (!$user || !password_verify($oldPassword, $user['password_hash'])) {
            $this->json(['success' => false, 'error' => 'Неверный текущий пароль']);
        }

        $newHash = password_hash($newPassword, PASSWORD_DEFAULT);
        $this->userModel->updatePassword($userId, $newHash);

        $this->json(['success' => true]);
    }

    // 12. Редактирование заявки
    private function updateOffer(): void
    {
        $this->requirePost();
        $userId = $this->requireAuth();

        $offerId     = (int)($_POST['offer_id'] ?? 0);
        $categoryId  = (int)($_POST['category_id'] ?? 0);
        $type        = ($_POST['type'] ?? '') === 'can_help' ? 'can_help' : 'need_help';
        $title       = trim($_POST['title'] ?? '');
        $description = trim($_POST['description'] ?? '');
        $status      = ($_POST['status'] ?? 'open') === 'closed' ? 'closed' : 'open';

        if ($offerId <= 0 || $categoryId <= 0 || $title === '' || $description === '') {
            $this->json(['success' => false, 'error' => 'Заполните все поля заявки']);
        }

        $updated = $this->offerModel->update($offerId, $userId, $categoryId, $type, $title, $description, $status);

        if (!$updated) {
            $this->json(['success' => false, 'error' => 'Заявка не найдена или у вас нет прав на её изменение']);
        }

        $this->json(['success' => true]);
    }

    // 13. Удаление заявки
    private function deleteOffer(): void
    {
        $this->requirePost();
        $userId = $this->requireAuth();

        $offerId = (int)($_POST['offer_id'] ?? 0);

        if ($offerId <= 0) {
            $this->json(['success' => false, 'error' => 'Некорректный ID заявки']);
        }

        if (!$this->offerModel->delete($offerId, $userId)) {
            $this->json(['success' => false, 'error' => 'Заявка не найдена или у вас нет прав на её удаление']);
        }

        $this->json(['success' => true]);
    }

    private function requirePost(): void
    {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            $this->json(['success' => false, 'error' => 'Неверный метод запроса'], 405);
        }
    }

    private function requireAuth(): int
    {
        if (!isset($_SESSION['user_id'])) {
            $this->json(['success' => false, 'error' => 'Не авторизован'], 401);
        }

        return (int)$_SESSION['user_id'];
    }
}
