<?php

declare(strict_types=1);

class RequestModel
{
    private PDO $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    public function exists(int $offerId, int $userId): bool
    {
        $stmt = $this->pdo->prepare("SELECT id FROM requests WHERE offer_id = ? AND user_id = ?");
        $stmt->execute([$offerId, $userId]);
        return (bool)$stmt->fetch();
    }

    public function create(int $offerId, int $userId, string $message): bool
    {
        $stmt = $this->pdo->prepare("INSERT INTO requests (offer_id, user_id, message) VALUES (?, ?, ?)");
        return $stmt->execute([$offerId, $userId, $message]);
    }

    public function getIncoming(int $userId): array
    {
        $stmt = $this->pdo->prepare("
            SELECT r.*, o.title AS offer_title, u.first_name, u.last_name, u.`group`
            FROM requests r
            JOIN offers o ON r.offer_id = o.id
            JOIN users u ON r.user_id = u.id
            WHERE o.user_id = ?
            ORDER BY r.created_at DESC
        ");
        $stmt->execute([$userId]);
        return $stmt->fetchAll();
    }

    public function getOutgoing(int $userId): array
    {
        $stmt = $this->pdo->prepare("
            SELECT r.*, o.title AS offer_title, o.status AS offer_status, c.name AS category_name, u.first_name, u.last_name, u.`group`
            FROM requests r
            JOIN offers o ON r.offer_id = o.id
            JOIN categories c ON o.category_id = c.id
            JOIN users u ON o.user_id = u.id
            WHERE r.user_id = ?
            ORDER BY r.created_at DESC
        ");
        $stmt->execute([$userId]);
        return $stmt->fetchAll();
    }
}
