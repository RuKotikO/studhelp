<?php

declare(strict_types=1);

class UserModel
{
    private PDO $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    public function findByEmail(string $email): ?array
    {
        $stmt = $this->pdo->prepare("SELECT * FROM users WHERE email = ?");
        $stmt->execute([$email]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    public function findById(int $id): ?array
    {
        $stmt = $this->pdo->prepare("SELECT id, first_name, last_name, `group`, email, password_hash FROM users WHERE id = ?");
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    public function create(string $firstName, string $lastName, string $group, string $email, string $passwordHash): int
    {
        $stmt = $this->pdo->prepare("
            INSERT INTO users (first_name, last_name, `group`, email, password_hash)
            VALUES (?, ?, ?, ?, ?)
        ");
        $stmt->execute([$firstName, $lastName, $group, $email, $passwordHash]);
        return (int)$this->pdo->lastInsertId();
    }

    public function updateProfile(int $id, string $firstName, string $lastName, string $group, string $email): bool
    {
        $stmt = $this->pdo->prepare("
            UPDATE users SET first_name = ?, last_name = ?, `group` = ?, email = ? WHERE id = ?
        ");
        return $stmt->execute([$firstName, $lastName, $group, $email, $id]);
    }

    public function updatePassword(int $id, string $newHash): bool
    {
        $stmt = $this->pdo->prepare("UPDATE users SET password_hash = ? WHERE id = ?");
        return $stmt->execute([$newHash, $id]);
    }
}
