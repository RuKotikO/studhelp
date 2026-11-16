<?php

declare(strict_types=1);

class OfferController
{
    private OfferModel $offerModel;

    public function __construct(OfferModel $offerModel)
    {
        $this->offerModel = $offerModel;
    }

    public function index(): void
    {
        $currentUserId = (int)($_SESSION['user_id'] ?? 0);
        $offers = $this->offerModel->getActive($_GET, $currentUserId);

        require dirname(__DIR__) . '/views/offers/index.php';
    }
}
