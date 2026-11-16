<?php if (empty($offers)): ?>
    <p style="grid-column:1/-1;text-align:center;color:#7f8c8d;">По вашему запросу ничего не найдено.</p>
<?php else: ?>
    <?php foreach ($offers as $offer): ?>
        <div class="card">
            <div>
                <span class="badge"><?= htmlspecialchars((string)$offer['category_name']) ?></span>
                <?php if ($offer['type'] === 'can_help'): ?>
                    <span class="badge" style="background:#e8f8f5;color:#27ae60;margin-left:6px;">Могу помочь</span>
                <?php else: ?>
                    <span class="badge" style="background:#fef5e7;color:#d35400;margin-left:6px;">Нужна помощь</span>
                <?php endif; ?>
            </div>

            <h2><?= htmlspecialchars((string)$offer['title']) ?></h2>
            <p style="margin:10px 0;font-size:15px;"><?= nl2br(htmlspecialchars((string)$offer['description'])) ?></p>

            <p class="author" style="margin-bottom:2px;">
                Автор: <?= htmlspecialchars((string)$offer['first_name']) ?> <?= htmlspecialchars((string)$offer['last_name']) ?> (<?= htmlspecialchars((string)$offer['group']) ?>)
            </p>
            <p class="author" style="margin-top:0;font-size:11px;">
                🕒 Дата: <?= htmlspecialchars((string)$offer['created_at']) ?>
            </p>

            <?php if (!$currentUserId): ?>
                <p class="author">Войдите, чтобы откликнуться</p>
            <?php elseif ((int)$currentUserId === (int)$offer['user_id']): ?>
                <p class="status-wait">⏳ Ваша заявка активна</p>
            <?php elseif ((int)$offer['already_replied'] > 0): ?>
                <p class="reply-box" style="margin-top:10px;">✓ Вы уже откликнулись на эту заявку</p>
            <?php else: ?>
                <form class="reply-form" data-id="<?= (int)$offer['id'] ?>">
                    <input type="text" name="message" placeholder="Напишите автору..." required maxlength="2000">
                    <button type="submit" class="btn">Откликнуться</button>
                </form>
            <?php endif; ?>
        </div>
    <?php endforeach; ?>
<?php endif; ?>
