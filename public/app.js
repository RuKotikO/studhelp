document.addEventListener('DOMContentLoaded', () => {
    const path = window.location.pathname;
    const isProfilePage = path.includes('profile.html');
    
    let currentUser = null;
    let allOffers = [];

    // Переключение между Главной и Каталогом внутри единого index.html
    function switchTab(tabName) {
        const homeView = document.getElementById('view-home');
        const catalogView = document.getElementById('view-catalog');
        if (!homeView || !catalogView) return;

        if (tabName === 'catalog') {
            homeView.style.display = 'none';
            catalogView.style.display = 'block';
            window.location.hash = 'catalog';
            loadCatalogOffers();
            loadCategories();
        } else {
            catalogView.style.display = 'none';
            homeView.style.display = 'block';
            history.replaceState(null, null, 'index.html');
        }
    }

    // Привязка кнопок и ссылок переключения вкладок
    function bindTabLinks(container = document) {
        container.querySelectorAll('[data-tab]').forEach(el => {
            el.addEventListener('click', (e) => {
                if (!isProfilePage) {
                    e.preventDefault();
                    switchTab(el.getAttribute('data-tab'));
                }
            });
        });
    }

    // 1. Инициализация приложения
    checkAuth().then(() => {
        if (isProfilePage) {
            if (!currentUser) { 
                window.location.href = 'index.html'; 
                return; 
            }
            loadCategories();
            loadProfileData();
        } else {
            bindTabLinks(document);
            if (window.location.hash === '#catalog') {
                switchTab('catalog');
            } else {
                loadCategories();
            }
        }
    });

    // 2. Проверка сессии и отрисовка единой навигации
    async function checkAuth() {
        const res = await fetch('api.php?action=check_auth');
        const data = await res.json();
        const nav = document.getElementById('nav-auth');
        const createBtn = document.getElementById('btn-create-trigger');

        const baseLinks = isProfilePage
            ? `<a href="index.html" class="nav-link">Главная</a>
               <a href="index.html#catalog" class="nav-link">Каталог</a>`
            : `<a href="#" class="nav-link" data-tab="home">Главная</a>
               <a href="#catalog" class="nav-link" data-tab="catalog">Каталог</a>`;

        if (data.auth) {
            currentUser = data;
            if (createBtn) createBtn.style.display = 'inline-block';
            if (nav) {
                nav.innerHTML = `
                    ${baseLinks}
                    <a href="profile.html" class="btn">Мой профиль</a>
                    <button id="btn-logout" class="btn btn-danger">Выйти</button>
                `;
                document.getElementById('btn-logout').addEventListener('click', logout);
            }
        } else {
            currentUser = null;
            if (createBtn) createBtn.style.display = 'none';
            if (nav) {
                const authButtons = isProfilePage
                    ? `<a href="index.html" class="btn">Войти</a>`
                    : `<button class="btn" data-modal="loginModal">Войти</button>
                       <button class="btn btn-success" data-modal="registerModal">Регистрация</button>`;

                nav.innerHTML = `
                    ${baseLinks}
                    ${authButtons}
                `;
                if (!isProfilePage) initModalTriggers();
            }
        }

        if (!isProfilePage && nav) {
            bindTabLinks(nav);
        }
    }

        function applyFilters() {
            const searchVal = (document.getElementById('filter-search')?.value || '').toLowerCase().trim();
            const catVal = document.getElementById('filter-category')?.value || 'all';
            const sortVal = document.getElementById('filter-sort')?.value || 'newest';
            const onlyNotReplied = document.getElementById('filter-not-replied')?.checked || false;
    
            let filtered = allOffers.filter(offer => {
                if (catVal !== 'all' && offer.category_id != catVal) return false;
    
                if (searchVal) {
                    const haystack = `${offer.title} ${offer.description} ${offer.first_name} ${offer.last_name} ${offer.group}`.toLowerCase();
                    if (!haystack.includes(searchVal)) return false;
                }
    
                if (onlyNotReplied && currentUser) {
                    if (offer.already_replied > 0 || offer.user_id == currentUser.user_id) return false;
                }
    
                return true;
            });
    
            filtered.sort((a, b) => {
                if (sortVal === 'oldest') {
                    return (a.created_at || '').localeCompare(b.created_at || '');
                }
                if (sortVal === 'updated') {
                    const dateA = a.updated_at || a.created_at || '';
                    const dateB = b.updated_at || b.created_at || '';
                    return dateB.localeCompare(dateA);
                }
                return (b.created_at || '').localeCompare(a.created_at || '');
            });
    
            renderOffers(filtered);
        }
    
        async function loadCategories() {
            const createSelect = document.getElementById('select-category');
            const filterSelect = document.getElementById('filter-category');
            const editSelect = document.getElementById('edit-offer-category');
            
            const res = await fetch('api.php?action=get_categories');
            const data = await res.json();
    
            if (createSelect) {
                createSelect.innerHTML = '<option value="">Выберите предмет/категорию</option>';
                data.categories.forEach(cat => {
                    createSelect.innerHTML += `<option value="${cat.id}">${cat.name}</option>`;
                });
            }
    
            if (editSelect) {
                editSelect.innerHTML = '';
                data.categories.forEach(cat => {
                    editSelect.innerHTML += `<option value="${cat.id}">${cat.name}</option>`;
                });
            }
    
            if (filterSelect) {
                const currentVal = filterSelect.value || 'all';
                filterSelect.innerHTML = '<option value="all">Все предметы</option>';
                data.categories.forEach(cat => {
                    filterSelect.innerHTML += `<option value="${cat.id}">${cat.name}</option>`;
                });
                filterSelect.value = currentVal;
                filterSelect.onchange = applyFilters;
            }
    
            const searchInput = document.getElementById('filter-search');
            const sortSelect = document.getElementById('filter-sort');
            const notRepliedCheck = document.getElementById('filter-not-replied');
            const resetBtn = document.getElementById('btn-reset-filters');
    
            if (searchInput) searchInput.oninput = applyFilters;
            if (sortSelect) sortSelect.onchange = applyFilters;
            if (notRepliedCheck) notRepliedCheck.onchange = applyFilters;
    
            if (resetBtn) {
                resetBtn.onclick = () => {
                    if (searchInput) searchInput.value = '';
                    if (filterSelect) filterSelect.value = 'all';
                    if (sortSelect) sortSelect.value = 'newest';
                    if (notRepliedCheck) notRepliedCheck.checked = false;
                    applyFilters();
                };
            }
        }
        async function loadCatalogOffers() {
            const grid = document.getElementById('catalog-grid');
            if (!grid) return;
    
            const res = await fetch('api.php?action=get_offers');
            const data = await res.json();
            allOffers = data.offers;
            
            applyFilters();
        }
            // Отрисовка карточек каталога
    function renderOffers(offersList) {
        const grid = document.getElementById('catalog-grid');
        if (!grid) return;
        grid.innerHTML = '';

        if (!offersList || offersList.length === 0) {
            grid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #7f8c8d;">Активных заявок по выбранным параметрам пока нет.</p>';
            return;
        }

        offersList.forEach(offer => {
            const card = document.createElement('div');
            card.className = 'card';
            
            let actionBlock = '';
            if (currentUser && currentUser.user_id != offer.user_id) {
                if (offer.already_replied > 0) {
                    actionBlock = `<p class="reply-box" style="margin-top: 10px;">✓ Вы уже откликнулись на эту заявку</p>`;
                } else {
                    actionBlock = `
                        <form class="reply-form" data-id="${offer.id}">
                            <input type="text" name="message" placeholder="Напишите автору (сообщение)..." required>
                            <button type="submit" class="btn">Откликнуться</button>
                        </form>
                    `;
                }
            } else if (!currentUser) {
                actionBlock = `<p class="author">Войдите, чтобы откликнуться</p>`;
            } else {
                actionBlock = `<p class="status-wait">⏳ Ваше предложение активно</p>`;
            }

            const isEdited = offer.updated_at && offer.updated_at !== offer.created_at;
            const dateBadge = isEdited 
                ? `Обновлено: ${offer.updated_at}` 
                : `Создано: ${offer.created_at || ''}`;

            card.innerHTML = `
                <span class="badge">${offer.category_name}</span>
                <h2>${offer.title}</h2>
                <p style="margin: 10px 0; font-size:15px;">${offer.description}</p>
                <p class="author" style="margin-bottom: 2px;">Создал: ${offer.first_name} ${offer.last_name} (${offer.group})</p>
                <p class="author" style="margin-top: 0; font-size: 11px;">🕒 ${dateBadge}</p>
                ${actionBlock}
            `;
            grid.appendChild(card);
        });

        document.querySelectorAll('.reply-form').forEach(form => {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const formData = new FormData(form);
                formData.append('offer_id', form.getAttribute('data-id'));

                const res = await fetch('api.php?action=create_request', { method: 'POST', body: formData });
                const result = await res.json();
                if (result.success) {
                    alert('Вы успешно откликнулись!');
                    loadCatalogOffers();
                } else {
                    alert(result.error || 'Ошибка при отправке отклика');
                }
            });
        });
    }


    // 5. Загрузка и управление личным кабинетом (profile.html)
    async function loadProfileData() {
        const res = await fetch('api.php?action=get_profile_data');
        const data = await res.json();
        if (!data.success) return;

        // Заполняем режим просмотра и форму редактирования основных данных
        if (data.user) {
            document.getElementById('view-fullname').textContent = `${data.user.first_name} ${data.user.last_name}`;
            document.getElementById('view-group').textContent = data.user.group;
            document.getElementById('view-email').textContent = data.user.email;

            document.getElementById('prof-first-name').value = data.user.first_name;
            document.getElementById('prof-last-name').value = data.user.last_name;
            document.getElementById('prof-group').value = data.user.group;
            document.getElementById('prof-email').value = data.user.email;
        }

        // Выводим входящие отклики
        const incSection = document.getElementById('incoming-section');
        const incGrid = document.getElementById('incoming-grid');
        if (incSection && incGrid) {
            if (data.incoming_requests && data.incoming_requests.length > 0) {
                incSection.style.display = 'block';
                incGrid.innerHTML = '';
                data.incoming_requests.forEach(req => {
                    const card = document.createElement('div');
                    card.className = "card";
                    card.style.borderLeftColor = "#e67e22";
                    card.innerHTML = `
                        <span class="badge" style="background:#ffeaa7; color:#d35400;">Заявка: ${req.offer_title}</span>
                        <p style="margin: 10px 0;"><b>Сообщение от студента:</b> ${req.message}</p>
                        <p class="author">Отправитель: ${req.first_name} ${req.last_name} (Группа: ${req.group})</p>
                    `;
                    incGrid.appendChild(card);
                });
            } else {
                incSection.style.display = 'none';
            }
        }
        const outSection = document.getElementById('outgoing-section');
        const outGrid = document.getElementById('outgoing-grid');
        if (outSection && outGrid) {
            if (data.outgoing_requests && data.outgoing_requests.length > 0) {
                outSection.style.display = 'block';
                outGrid.innerHTML = '';
                data.outgoing_requests.forEach(req => {
                    const card = document.createElement('div');
                    card.className = "card";
                    card.style.borderLeftColor = "#2ecc71";
                    card.innerHTML = `
                        <span class="badge">${req.category_name}</span>
                        <h2>${req.offer_title}</h2>
                        <p style="margin: 10px 0;"><b>Ваше сообщение:</b> ${req.message}</p>
                        <p class="author">Автор заявки: ${req.first_name} ${req.last_name} (${req.group})</p>
                        <p class="status-wait" style="color: #27ae60;">✓ Вы откликнулись (тема ${req.offer_status === 'open' ? 'открыта' : 'закрыта'})</p>
                    `;
                    outGrid.appendChild(card);
                });
            } else {
                outSection.style.display = 'none';
            }
        }
        // Отрисовываем таблицу заявок в 1 строку
        const tbody = document.getElementById('my-offers-tbody');
        if (tbody) {
            const myOffers = data.my_offers || [];
            tbody.innerHTML = '';

            if (myOffers.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#7f8c8d;">Вы еще не создали ни одной заявки.</td></tr>';
                return;
            }

            myOffers.forEach(offer => {
                const tr = document.createElement('tr');
                const createdStr = offer.created_at ? offer.created_at : '—';
                const updatedStr = offer.updated_at ? offer.updated_at : createdStr;
                const statusText = offer.status === 'open' ? 'Активно' : 'Закрыто';
                
                tr.innerHTML = `
                    <td><span class="badge" style="margin:0;">${offer.category_name}</span></td>
                    <td><b>${offer.title}</b></td>
                    <td style="color:#7f8c8d; font-size:13px;">${createdStr}</td>
                    <td style="color:#7f8c8d; font-size:13px;">${updatedStr}</td>
                    <td><span class="status-pill ${offer.status}">${statusText}</span></td>
                `;

                tr.addEventListener('click', () => {
                    document.getElementById('edit-offer-id').value = offer.id;
                    document.getElementById('edit-offer-category').value = offer.category_id;
                    document.getElementById('edit-offer-title').value = offer.title;
                    document.getElementById('edit-offer-desc').value = offer.description;
                    document.getElementById('edit-offer-status').value = offer.status;
                    document.getElementById('editOfferModal').style.display = 'block';
                });

                tbody.appendChild(tr);
            });

        }
    }
    // Переключение между просмотром и редактированием профиля
    const btnEditProfile = document.getElementById('btn-edit-profile');
    const btnCancelProfile = document.getElementById('btn-cancel-profile');
    const profileViewMode = document.getElementById('profile-view-mode');
    const profileEditForm = document.getElementById('form-profile-edit');

    if (btnEditProfile && profileEditForm) {
        btnEditProfile.addEventListener('click', () => {
            profileViewMode.style.display = 'none';
            btnEditProfile.style.display = 'none';
            profileEditForm.style.display = 'grid';
        });

        btnCancelProfile.addEventListener('click', () => {
            profileEditForm.style.display = 'none';
            profileViewMode.style.display = 'grid';
            btnEditProfile.style.display = 'inline-block';
            loadProfileData();
        });

        profileEditForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const res = await fetch('api.php?action=update_profile', { method: 'POST', body: new FormData(profileEditForm) });
            const data = await res.json();
            if (data.success) {
                alert('Данные профиля успешно обновлены!');
                profileEditForm.style.display = 'none';
                profileViewMode.style.display = 'grid';
                btnEditProfile.style.display = 'inline-block';
                checkAuth();
                loadProfileData();
            } else {
                alert(data.error || 'Ошибка при сохранении профиля');
            }
        });
    }

    // Сохранение отредактированной заявки
    const editOfferForm = document.getElementById('form-edit-offer');
    if (editOfferForm) {
        editOfferForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const res = await fetch('api.php?action=update_offer', { method: 'POST', body: new FormData(editOfferForm) });
            const data = await res.json();
            if (data.success) {
                document.getElementById('editOfferModal').style.display = 'none';
                alert('Заявка обновлена!');
                loadProfileData();
            } else {
                alert(data.error || 'Ошибка обновления заявки');
            }
        });
    }
    // Удаление своей заявки
    const btnDeleteOffer = document.getElementById('btn-delete-offer');
    if (btnDeleteOffer) {
        btnDeleteOffer.addEventListener('click', async () => {
            const offerId = document.getElementById('edit-offer-id').value;
            if (!offerId) return;

            if (!confirm('Вы действительно хотите удалить эту заявку? Все отклики на неё также будут удалены.')) {
                return;
            }

            const formData = new FormData();
            formData.append('offer_id', offerId);

            const res = await fetch('api.php?action=delete_offer', { method: 'POST', body: formData });
            const data = await res.json();
            if (data.success) {
                document.getElementById('editOfferModal').style.display = 'none';
                alert('Заявка удалена.');
                loadProfileData();
            } else {
                alert(data.error || 'Ошибка при удалении заявки');
            }
        });
    }


    // 6. Универсальный обработчик форм
    const handleFormSubmit = (formId, actionUrl, onSuccess) => {
        const form = document.getElementById(formId);
        if (!form) return;
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const res = await fetch(actionUrl, { method: 'POST', body: new FormData(form) });
            const data = await res.json();
            if (data.success) {
                form.reset();
                const modal = form.closest('.modal');
                if (modal) modal.style.display = 'none';
                onSuccess();
            } else { 
                alert(data.error || 'Ошибка выполнения'); 
            }
        });
    };

    handleFormSubmit('form-register', 'api.php?action=register', () => {
        checkAuth().then(() => { if (!isProfilePage) loadCatalogOffers(); });
    });
    handleFormSubmit('form-login', 'api.php?action=login', () => {
        checkAuth().then(() => { if (!isProfilePage) loadCatalogOffers(); });
    });
    handleFormSubmit('form-ticket', 'api.php?action=create_offer', () => {
        switchTab('catalog');
    });
    handleFormSubmit('form-change-password', 'api.php?action=change_password', () => {
        alert('Пароль успешно изменён!');
    });

    // 7. Выход из аккаунта
    async function logout() {
        await fetch('api.php?action=logout');
        if (isProfilePage) { 
            window.location.href = 'index.html'; 
        } else { 
            checkAuth().then(() => loadCatalogOffers()); 
        }
    }

    // 8. Управление модальными окнами
    function initModalTriggers() {
        document.querySelectorAll('[data-modal]').forEach(btn => {
            btn.onclick = () => { 
                const modal = document.getElementById(btn.getAttribute('data-modal'));
                if (modal) modal.style.display = 'block'; 
            };
        });
    }
    
    document.querySelectorAll('.close').forEach(btn => { 
        btn.onclick = (e) => {
            const modal = e.target.closest('.modal');
            if (modal) modal.style.display = 'none';
        }; 
    });
    
    window.onclick = (e) => { 
        if (e.target.classList.contains('modal')) {
            e.target.style.display = 'none'; 
        }
    };
    
    initModalTriggers();

    // 9. Динамическая валидация полей регистрации при вводе
    const regForm = document.getElementById('form-register');
    if (regForm) {
        const nameRegex = /^[а-яА-ЯёЁa-zA-Z\s\-]+$/;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        const validators = {
            first_name: (val) => {
                if (!val.trim()) return { valid: false, msg: 'Введите имя' };
                if (!nameRegex.test(val)) return { valid: false, msg: '❌ Только буквы, пробел или дефис' };
                return { valid: true, msg: '✓ Имя корректно' };
            },
            last_name: (val) => {
                if (!val.trim()) return { valid: false, msg: 'Введите фамилию' };
                if (!nameRegex.test(val)) return { valid: false, msg: '❌ Только буквы, пробел или дефис' };
                return { valid: true, msg: '✓ Фамилия корректна' };
            },
            group: (val) => {
                if (!val.trim()) return { valid: false, msg: 'Укажите учебную группу' };
                return { valid: true, msg: '✓ Группа указана' };
            },
            email: (val) => {
                if (!val.trim()) return { valid: false, msg: 'Введите Email' };
                if (!emailRegex.test(val)) return { valid: false, msg: '❌ Некорректный формат Email (пример: name@mail.ru)' };
                return { valid: true, msg: '✓ Email корректный' };
            },
            password: (val) => {
                if (val.length === 0) return { valid: false, msg: 'Придумайте пароль' };
                if (val.length < 6) {
                    const left = 6 - val.length;
                    return { valid: false, msg: `❌ Слишком короткий (осталось ещё ${left} симв.)` };
                }
                return { valid: true, msg: '✓ Надёжная длина пароля' };
            }
        };

        const validateField = (input) => {
            const validator = validators[input.name];
            if (!validator) return true;

            const hint = input.parentElement.querySelector('.field-hint');
            const result = validator(input.value);

            input.classList.remove('input-error', 'input-valid');
            if (hint) hint.classList.remove('valid');

            if (result.valid) {
                input.classList.add('input-valid');
                if (hint) hint.classList.add('valid');
            } else {
                input.classList.add('input-error');
            }
            if (hint) hint.textContent = result.msg;
            return result.valid;
        };

        regForm.querySelectorAll('input').forEach(input => {
            input.addEventListener('input', () => validateField(input));
        });

        regForm.addEventListener('submit', (e) => {
            let isFormValid = true;
            regForm.querySelectorAll('input').forEach(input => {
                if (!validateField(input)) isFormValid = false;
            });

            if (!isFormValid) {
                e.preventDefault();
                e.stopImmediatePropagation();
            }
        }, true);
    }
});
