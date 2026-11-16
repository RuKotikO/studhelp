<?php

declare(strict_types=1);

class OfferModel
{
    private PDO $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    public function getActive(array $filters = [], int $currentUserId = 0): array
    {
        $search = trim((string)($filters['search'] ?? ''));
        $categoryId = (int)($filters['category_id'] ?? 0);
        $type = (string)($filters['type'] ?? '');
        $sortBy = (string)($filters['sort_by'] ?? 'created_at');
        $sortDir = strtoupper((string)($filters['sort_dir'] ?? 'DESC'));

        $allowedSort = [
            'created_at' => 'o.created_at',
            'title'      => 'o.title',
        ];

        $orderColumn = $allowedSort[$sortBy] ?? 'o.created_at';
        $orderDir = in_array($sortDir, ['ASC', 'DESC'], true) ? $sortDir : 'DESC';

        $where = ["o.status = 'open'"];
        $params = [];

        if (in_array($type, ['need_help', 'can_help'], true)) {
            $where[] = 'o.type = ?';
            $params[] = $type;
        }

        if ($categoryId > 0) {
            $where[] = 'o.category_id = ?';
            $params[] = $categoryId;
        }

        if ($search !== '') {
            $where[] = '(o.title LIKE ? OR o.description LIKE ?)';
            $like = '%' . $search . '%';
            $params[] = $like;
            $params[] = $like;
        }

        $whereSql = 'WHERE ' . implode(' AND ', $where);

        $sql = "
            SELECT
                o.*,
                c.name AS category_name,
                u.first_name,
                u.last_name,
                u.`group`,
                (
                    SELECT COUNT(*)
                    FROM requests r
                    WHERE r.offer_id = o.id
                      AND r.user_id = ?
                ) AS already_replied
            FROM offers o
            JOIN categories c ON o.category_id = c.id
            JOIN users u ON o.user_id = u.id
            $whereSql
            ORDER BY $orderColumn $orderDir
        ";

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute(array_merge([$currentUserId], $params));

        return $stmt->fetchAll();
    }

    public function getCategories(): array
    {
        $stmt = $this->pdo->query("SELECT * FROM categories ORDER BY name ASC");
        return $stmt->fetchAll();
    }

    public function getById(int $id): ?array
    {
        $stmt = $this->pdo->prepare("SELECT * FROM offers WHERE id = ?");
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    public function getByUser(int $userId): array
    {
        $stmt = $this->pdo->prepare("
            SELECT o.*, c.name AS category_name
            FROM offers o
            JOIN categories c ON o.category_id = c.id
            WHERE o.user_id = ?
            ORDER BY o.created_at DESC
        ");
        $stmt->execute([$userId]);
        return $stmt->fetchAll();
    }

    public function create(int $userId, int $categoryId, string $type, string $title, string $description): bool
    {
        $stmt = $this->pdo->prepare("
            INSERT INTO offers (user_id, category_id, type, title, description, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ");
        return $stmt->execute([$userId, $categoryId, $type, $title, $description]);
    }

    public function update(int $offerId, int $userId, int $categoryId, string $type, string $title, string $description, string $status): bool
    {
        $stmt = $this->pdo->prepare("
            UPDATE offers
            SET category_id = ?, type = ?, title = ?, description = ?, status = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND user_id = ?
        ");
        $stmt->execute([$categoryId, $type, $title, $description, $status, $offerId, $userId]);
        return $stmt->rowCount() > 0 || $this->getById($offerId) !== null;
    }

    public function delete(int $offerId, int $userId): bool
    {
        $stmt = $this->pdo->prepare("DELETE FROM offers WHERE id = ? AND user_id = ?");
        $stmt->execute([$offerId, $userId]);
        return $stmt->rowCount() > 0;
    }
}
