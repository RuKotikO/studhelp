document.addEventListener('DOMContentLoaded', () => {
    const isProfilePage = window.location.pathname.includes('profile.html');
    const $ = id => document.getElementById(id);
    let currentUser = null;
    let searchTimer = null;
    let csrfToken = '';

    function escapeHTML(value) {
        return String(value ?? '').replace(/[&<>"']/g, char => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        })[char]);
    }

    async function api(url, body = null) {
        try {
            const options = {
                method: body ? 'POST' : 'GET',
                credentials: 'same-origin',
                headers: {}
            };
            if (body) {
                options.body = body;
                if (csrfToken) {
                    options.headers['X-CSRF-Token'] = csrfToken;
                }
            }
            const response = await fetch(url, options);
            const data = await response.json();
            if (data.csrf_token) {
                csrfToken = data.csrf_token;
            }
            if (!response.ok && !data.error) data.error = 'Ошибка сервера';
            return data;
        } catch (error) {
            console.error('API error:', error);
            return {
                success: false,
                auth: false,
                error: 'Не удалось подключиться к серверу'
            };
        }
    }

    function switchTab(tab) {
        const home = $('view-home');
        const catalog = $('view-catalog');
        if (!home || !catalog) return;
        const isCatalog = tab === 'catalog';
        home.style.display = isCatalog ? 'none' : 'block';
        catalog.style.display = isCatalog ? 'block' : 'none';
        if (isCatalog) {
            window.location.hash = 'catalog';
            loadCatalogOffers();
            loadCategories();
        } else {
            history.replaceState(null, null, 'index.html');
        }
    }

    function bindTabLinks(root = document) {
        if (isProfilePage) return;
        root.querySelectorAll('[data-tab]').forEach(element => {
            element.onclick = event => {
                event.preventDefault();
                switchTab(element.dataset.tab);
            };
        });
    }

    async function initialize() {
        await checkAuth();
        if (isProfilePage) {
            if (!currentUser) {
                window.location.href = 'index.html';
                return;
            }
            await loadCategories();
            await loadProfileData();
        } else {
            bindTabLinks();
            if (window.location.hash === '#catalog') {
                switchTab('catalog');
            } else {
                await loadCategories();
            }
        }
    }

    async function checkAuth() {
        const data = await api('/api.php?action=check_auth');
        const nav = $('nav-auth');
        const createBtn = $('btn-create-trigger');
        currentUser = data.auth ? data : null;
        if (createBtn) {
            createBtn.style.display = data.auth ? 'inline-block' : 'none';
        }
        if (!nav) return;
        const baseLinks = isProfilePage
            ? `<a href="index.html" class="nav-link">Главная</a><a href="index.html#catalog" class="nav-link">Каталог</a>`
            : `<a href="#" class="nav-link" data-tab="home">Главная</a><a href="#catalog" class="nav-link" data-tab="catalog">Каталог</a>`;
        if (currentUser) {
            nav.innerHTML = `${baseLinks}<a href="profile.html" class="btn">Мой профиль</a><button id="btn-logout" class="btn btn-danger">Выйти</button>`;
            $('btn-logout').onclick = logout;
        } else {
            const authButtons = isProfilePage
                ? `<a href="index.html" class="btn">Войти</a>`
                : `<button class="btn" data-modal="loginModal">Войти</button><button class="btn btn-success" data-modal="registerModal">Регистрация</button>`;
            nav.innerHTML = baseLinks + authButtons;
            if (!isProfilePage) initModalTriggers(nav);
        }
        bindTabLinks(nav);
    }
    async function loadCategories() {
        const data = await api('/api.php?action=get_categories');
        if (!data.success && data.error) {
            console.error(data.error);
            return;
        }
        const categories = data.categories || [];
        function fillSelect(select, firstOption = false) {
            if (!select) return;
            select.innerHTML = '';
            if (firstOption) {
                const option = document.createElement('option');
                option.value = '';
                option.textContent = 'Выберите предмет/категорию';
                select.appendChild(option);
            }
            categories.forEach(category => {
                const option = document.createElement('option');
                option.value = category.id;
                option.textContent = category.name;
                select.appendChild(option);
            });
        }
        fillSelect($('select-category'), true);
        fillSelect($('edit-offer-category'));

        const filterCat = $('filter-category');
        if (filterCat) {
            const previousValue = filterCat.value || '0';
            filterCat.innerHTML = '';
            const allOption = document.createElement('option');
            allOption.value = '0';
            allOption.textContent = 'Все предметы';
            filterCat.appendChild(allOption);
            categories.forEach(category => {
                const option = document.createElement('option');
                option.value = category.id;
                option.textContent = category.name;
                filterCat.appendChild(option);
            });
            filterCat.value = previousValue;
        }

        ['filter-category', 'filter-type', 'filter-sort-by', 'filter-sort-dir'].forEach(id => {
            const element = $(id);
            if (element) element.onchange = loadCatalogOffers;
        });

        const search = $('filter-search');
        if (search) {
            search.oninput = () => {
                clearTimeout(searchTimer);
                searchTimer = setTimeout(loadCatalogOffers, 300);
            };
        }

        const resetBtn = $('btn-reset-filters');
        if (resetBtn) {
            resetBtn.onclick = event => {
                event.preventDefault();
                if ($('filter-search')) $('filter-search').value = '';
                if ($('filter-type')) $('filter-type').value = '';
                if ($('filter-category')) $('filter-category').value = '0';
                if ($('filter-sort-by')) $('filter-sort-by').value = 'created_at';
                if ($('filter-sort-dir')) $('filter-sort-dir').value = 'DESC';
                loadCatalogOffers();
            };
        }
    }

    async function loadCatalogOffers() {
        const grid = $('catalog-grid');
        if (!grid) return;

        const params = new URLSearchParams({
            search: ($('filter-search')?.value || '').trim(),
            type: $('filter-type')?.value || '',
            category_id: $('filter-category')?.value || '0',
            sort_by: $('filter-sort-by')?.value || 'created_at',
            sort_dir: $('filter-sort-dir')?.value || 'DESC'
        });

        grid.innerHTML = '<p>Загрузка заявок...</p>';

        try {
            const response = await fetch(`/offers/view?${params}`, {
                credentials: 'same-origin'
            });
            if (!response.ok) {
                throw new Error('Ошибка загрузки каталога');
            }
            grid.innerHTML = await response.text();
        } catch (error) {
            grid.innerHTML = '<p class="error">Не удалось загрузить заявки</p>';
            return;
        }

        grid.querySelectorAll('.reply-form').forEach(form => {
            form.onsubmit = async event => {
                event.preventDefault();
                const submitButton = form.querySelector('button');
                submitButton.disabled = true;
                const fd = new FormData(form);
                fd.append('offer_id', form.dataset.id);
                const result = await api('/api.php?action=create_request', fd);
                alert(result.success ? 'Вы успешно откликнулись!' : result.error || 'Ошибка отклика');
                if (result.success) {
                    await loadCatalogOffers();
                } else {
                    submitButton.disabled = false;
                }
            };
        });
    }

    initialize();

    async function loadProfileData() {
        const data = await api('/api.php?action=get_profile_data');
        if (!data.success) {
            alert(data.error || 'Не удалось загрузить профиль');
            return;
        }
        if (data.user) {
            $('view-fullname').textContent = `${data.user.first_name} ${data.user.last_name}`;
            $('view-group').textContent = data.user.group;
            $('view-email').textContent = data.user.email;
            $('prof-first-name').value = data.user.first_name;
            $('prof-last-name').value = data.user.last_name;
            $('prof-group').value = data.user.group;
            $('prof-email').value = data.user.email;
        }

        const incoming = data.incoming_requests || [];
        if ($('incoming-section')) {
            $('incoming-section').style.display = incoming.length ? 'block' : 'none';
            if ($('incoming-grid')) {
                $('incoming-grid').innerHTML = incoming.map(request => `
                    <div class="card" style="border-left-color:#e67e22;">
                        <span class="badge" style="background:#ffeaa7;color:#d35400;">Заявка: ${escapeHTML(request.offer_title)}</span>
                        <p style="margin:10px 0;"><b>Сообщение:</b> ${escapeHTML(request.message)}</p>
                        <p class="author">От: ${escapeHTML(request.first_name)} ${escapeHTML(request.last_name)} (${escapeHTML(request.group)})</p>
                    </div>
                `).join('');
            }
        }

        const outgoing = data.outgoing_requests || [];
        if ($('outgoing-section')) {
            $('outgoing-section').style.display = outgoing.length ? 'block' : 'none';
            if ($('outgoing-grid')) {
                $('outgoing-grid').innerHTML = outgoing.map(request => `
                    <div class="card" style="border-left-color:#2ecc71;">
                        <span class="badge">${escapeHTML(request.category_name)}</span>
                        <h2>${escapeHTML(request.offer_title)}</h2>
                        <p style="margin:10px 0;"><b>Ваше сообщение:</b> ${escapeHTML(request.message)}</p>
                        <p class="author">Автор: ${escapeHTML(request.first_name)} ${escapeHTML(request.last_name)} (${escapeHTML(request.group)})</p>
                        <p class="status-wait" style="color:#27ae60;">✓ Вы откликнулись (${request.offer_status === 'open' ? 'открыта' : 'закрыта'})</p>
                    </div>
                `).join('');
            }
        }

        const tbody = $('my-offers-tbody');
        if (tbody) {
            const offers = data.my_offers || [];
            if (!offers.length) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#7f8c8d;">Вы еще не создали ни одной заявки.</td></tr>';
            } else {
                tbody.innerHTML = '';
                offers.forEach(offer => {
                    const tr = document.createElement('tr');
                    const values = [
                        offer.category_name,
                        offer.title,
                        offer.created_at || '—',
                        offer.updated_at || offer.created_at || '—',
                        offer.status === 'open' ? 'Активно' : 'Закрыто'
                    ];
                    values.forEach(value => {
                        const td = document.createElement('td');
                        td.textContent = value ?? '';
                        tr.appendChild(td);
                    });
                    tr.style.cursor = 'pointer';
                    tr.onclick = () => openEditOffer(offer);
                    tbody.appendChild(tr);
                });
            }
        }
    }
    function openEditOffer(offer) {
        if (!$('editOfferModal')) return;
        $('edit-offer-id').value = offer.id;
        $('edit-offer-category').value = offer.category_id;
        if ($('edit-offer-type')) $('edit-offer-type').value = offer.type || 'need_help';
        $('edit-offer-title').value = offer.title;
        $('edit-offer-desc').value = offer.description;
        $('edit-offer-status').value = offer.status;
        $('editOfferModal').style.display = 'block';
    }

    if ($('btn-edit-profile')) {
        const toggleEdit = edit => {
            if ($('profile-view-mode')) $('profile-view-mode').style.display = edit ? 'none' : 'grid';
            $('btn-edit-profile').style.display = edit ? 'none' : 'inline-block';
            if ($('form-profile-edit')) $('form-profile-edit').style.display = edit ? 'grid' : 'none';
            if (!edit) loadProfileData();
        };
        $('btn-edit-profile').onclick = () => toggleEdit(true);
        if ($('btn-cancel-profile')) {
            $('btn-cancel-profile').onclick = () => toggleEdit(false);
        }
        if ($('form-profile-edit')) {
            $('form-profile-edit').onsubmit = async event => {
                event.preventDefault();
                const form = event.target;
                const button = form.querySelector('[type="submit"]');
                if (button) button.disabled = true;
                const result = await api('/api.php?action=update_profile', new FormData(form));
                alert(result.success ? 'Профиль обновлён!' : result.error || 'Ошибка сохранения');
                if (button) button.disabled = false;
                if (result.success) {
                    await checkAuth();
                    toggleEdit(false);
                }
            };
        }
    }

    if ($('btn-delete-offer')) {
        $('btn-delete-offer').onclick = async () => {
            const id = $('edit-offer-id')?.value;
            if (!id) {
                alert('Заявка не выбрана');
                return;
            }
            if (!confirm('Удалить эту заявку вместе со всеми откликами?')) return;
            const fd = new FormData();
            fd.append('offer_id', id);
            const result = await api('/api.php?action=delete_offer', fd);
            if (result.success) {
                if ($('editOfferModal')) $('editOfferModal').style.display = 'none';
                alert('Заявка удалена.');
                await loadProfileData();
            } else {
                alert(result.error || 'Ошибка удаления');
            }
        };
    }

    function bindForm(id, url, onSuccess) {
        const form = $(id);
        if (!form) return;
        form.onsubmit = async event => {
            event.preventDefault();
            const button = form.querySelector('[type="submit"]');
            if (button) button.disabled = true;
            const result = await api(url, new FormData(form));
            if (button) button.disabled = false;
            if (result.success) {
                form.reset();
                const modal = form.closest('.modal');
                if (modal) modal.style.display = 'none';
                if (typeof onSuccess === 'function') await onSuccess(result);
            } else {
                alert(result.error || 'Ошибка выполнения');
            }
        };
    }

    bindForm('form-register', '/api.php?action=register', async () => {
        alert('Регистрация прошла успешно!');
        await checkAuth();
        if (!isProfilePage) await loadCatalogOffers();
    });

    bindForm('form-login', '/api.php?action=login', async () => {
        alert('Вы успешно вошли!');
        await checkAuth();
        if (!isProfilePage) await loadCatalogOffers();
    });

    bindForm('form-ticket', '/api.php?action=create_offer', async () => {
        alert('Заявка успешно создана!');
        switchTab('catalog');
    });

    bindForm('form-change-password', '/api.php?action=change_password', () => {
        alert('Пароль успешно изменён!');
    });

    bindForm('form-edit-offer', '/api.php?action=update_offer', async () => {
        alert('Заявка обновлена!');
        if ($('editOfferModal')) $('editOfferModal').style.display = 'none';
        await loadProfileData();
    });

    async function logout() {
        const result = await api('/api.php?action=logout', new FormData());
        if (result.success) {
            currentUser = null;
            if (isProfilePage) {
                window.location.href = 'index.html';
            } else {
                await checkAuth();
                await loadCatalogOffers();
            }
        } else {
            alert(result.error || 'Ошибка выхода');
        }
    }

    function initModalTriggers(root = document) {
        root.querySelectorAll('[data-modal]').forEach(button => {
            button.onclick = () => {
                const modal = $(button.dataset.modal);
                if (modal) modal.style.display = 'block';
            };
        });
    }

    document.querySelectorAll('.close').forEach(button => {
        button.onclick = event => {
            const modal = event.target.closest('.modal');
            if (modal) modal.style.display = 'none';
        };
    });

    window.addEventListener('click', event => {
        if (event.target.classList.contains('modal')) {
            event.target.style.display = 'none';
        }
    });

    initModalTriggers();
    const regForm = $('form-register');
    if (regForm) {
        const rules = {
            first_name: value => {
                if (!value.trim()) return [false, 'Введите имя'];
                if (!/^[а-яА-ЯёЁa-zA-Z\s-]+$/u.test(value)) return [false, '❌ Только буквы, пробел или дефис'];
                return [true, '✓ Имя корректно'];
            },
            last_name: value => {
                if (!value.trim()) return [false, 'Введите фамилию'];
                if (!/^[а-яА-ЯёЁa-zA-Z\s-]+$/u.test(value)) return [false, '❌ Только буквы, пробел или дефис'];
                return [true, '✓ Фамилия корректна'];
            },
            group: value => {
                if (!value.trim()) return [false, 'Укажите учебную группу'];
                if (!/^[а-яА-ЯёЁa-zA-Z0-9\s.-]+$/u.test(value)) return [false, '❌ Недопустимые символы'];
                return [true, '✓ Группа указана'];
            },
            email: value => {
                if (!value.trim()) return [false, 'Введите Email'];
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return [false, '❌ Некорректный формат Email'];
                return [true, '✓ Email корректный'];
            },
            password: value => {
                if (!value.length) return [false, 'Придумайте пароль'];
                if (value.length < 6) return [false, `❌ Осталось ещё ${6 - value.length} симв.`];
                return [true, '✓ Надёжная длина пароля'];
            }
        };

        function checkInput(input) {
            const rule = rules[input.name];
            if (!rule) return true;
            const [valid, message] = rule(input.value);
            input.classList.toggle('input-valid', valid);
            input.classList.toggle('input-error', !valid);
            const hint = input.parentElement.querySelector('.field-hint');
            if (hint) {
                hint.textContent = message;
                hint.classList.toggle('valid', valid);
            }
            return valid;
        }

        regForm.querySelectorAll('input').forEach(input => {
            input.addEventListener('input', () => checkInput(input));
            input.addEventListener('blur', () => checkInput(input));
        });

        regForm.addEventListener('submit', event => {
            const inputs = [...regForm.querySelectorAll('input')];
            const valid = inputs.every(input => checkInput(input));
            if (!valid) {
                event.preventDefault();
                event.stopImmediatePropagation();
            }
        }, true);
    }

    const gradesInput = $('grades-input');
    if (gradesInput) {
        document.querySelectorAll('.calc-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.calc-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                const isGpa = tab.dataset.calcTab === 'gpa';
                $('calc-tab-gpa').style.display = isGpa ? 'block' : 'none';
                $('calc-tab-target').style.display = isGpa ? 'none' : 'block';
            });
        });

        function calculateGPA() {
            const raw = gradesInput.value;
            const grades = (raw.match(/[2-5]/g) || []).map(Number);
            const countEl = $('res-count');
            const avgEl = $('res-avg');
            const stipEl = $('res-stipend');

            countEl.textContent = grades.length;

            if (!grades.length) {
                avgEl.textContent = '0.00';
                avgEl.style.color = '#1e293b';
                stipEl.textContent = 'Введите оценки';
                stipEl.style.color = '#1e293b';
                return;
            }

            const sum = grades.reduce((a, b) => a + b, 0);
            const avg = sum / grades.length;
            avgEl.textContent = avg.toFixed(2);

            const hasThrees = grades.includes(3) || grades.includes(2);
            if (grades.includes(2)) {
                avgEl.style.color = '#e74c3c';
                stipEl.textContent = 'Есть двойка (пересдача)';
                stipEl.style.color = '#e74c3c';
            } else if (hasThrees) {
                avgEl.style.color = '#e67e22';
                stipEl.textContent = 'Без стипендии (есть 3)';
                stipEl.style.color = '#e67e22';
            } else if (avg === 5) {
                avgEl.style.color = '#27ae60';
                stipEl.textContent = 'Повышенная (все 5)';
                stipEl.style.color = '#27ae60';
            } else {
                avgEl.style.color = '#2980b9';
                stipEl.textContent = 'Обычная стипендия';
                stipEl.style.color = '#2980b9';
            }
        }

        gradesInput.addEventListener('input', calculateGPA);

        document.querySelectorAll('.grade-btn[data-grade]').forEach(btn => {
            btn.addEventListener('click', () => {
                const val = gradesInput.value.trim();
                gradesInput.value = val ? `${val} ${btn.dataset.grade}` : btn.dataset.grade;
                calculateGPA();
            });
        });

        $('grades-clear').addEventListener('click', () => {
            gradesInput.value = '';
            calculateGPA();
        });

        const curInput = $('target-current');
        const cntInput = $('target-count');
        const goalSelect = $('target-goal');
        const answerBox = $('target-answer');

        function calculateTarget() {
            const cur = parseFloat(curInput.value);
            const cnt = parseInt(cntInput.value, 10);
            const goal = parseFloat(goalSelect.value);

            if (isNaN(cur) || isNaN(cnt) || cnt <= 0 || cur < 2 || cur > 5) {
                answerBox.textContent = 'Заполни текущий балл (от 2 до 5) и количество оценок.';
                return;
            }

            if (cur >= goal) {
                answerBox.textContent = `🎉 Твой балл (${cur.toFixed(2)}) уже достигает цели ${goal.toFixed(2)}!`;
                return;
            }

            const needed = Math.ceil((cnt * (goal - cur)) / (5 - goal));
            const finalAvg = ((cur * cnt + 5 * needed) / (cnt + needed)).toFixed(2);
            answerBox.textContent = `🔥 Нужно получить пятёрок подряд: ${needed} шт. (тогда средний балл станет ${finalAvg})`;
        }

        curInput.addEventListener('input', calculateTarget);
        cntInput.addEventListener('input', calculateTarget);
        goalSelect.addEventListener('change', calculateTarget);
    }
});
