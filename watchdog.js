import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

const LOGIN = 'Lord Simson';
const PASSWORD = '09052008Sasha';
const DASHBOARD_URL = 'https://gcp.2z2.top/dashboard';

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function runWatchdog() {
    console.log(`[${new Date().toISOString()}] 🔍 Watchdog запущен`);

    const browser = await puppeteer.launch({
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu'
        ]
    });

    let lastExtendTime = 0;
    let isCreating = false;
    let createdRecently = false;

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });

        // ----- ЛОГИН -----
        console.log('🔐 Логинюсь...');
        await page.goto(DASHBOARD_URL, { waitUntil: 'networkidle2', timeout: 90000 });
        await wait(5000); // даём странице отрисоваться

        // Поля логина
        const loginSelectors = ['input[name="login"]', 'input[type="text"]', '#login'];
        for (let sel of loginSelectors) {
            const input = await page.$(sel);
            if (input) {
                await input.click({ clickCount: 3 });
                await input.type(LOGIN);
                break;
            }
        }

        const passSelectors = ['input[name="password"]', 'input[type="password"]', '#password'];
        for (let sel of passSelectors) {
            const input = await page.$(sel);
            if (input) {
                await input.type(PASSWORD);
                break;
            }
        }

        // Кнопка входа
        await page.evaluate(() => {
            const btns = document.querySelectorAll('button, input[type="submit"]');
            for (let btn of btns) {
                if (btn.innerText?.toLowerCase().includes('login') ||
                    btn.value?.toLowerCase().includes('login') ||
                    btn.type === 'submit') {
                    btn.click();
                    return;
                }
            }
        });

        await wait(8000);
        console.log('✅ Логин выполнен, переходим в основной цикл');

        // ----- ОСНОВНОЙ ЦИКЛ -----
        while (true) {
            try {
                console.log(`\n📊 [${new Date().toISOString()}] Проверка состояния...`);

                // 1. Полное обновление страницы
                await page.reload({ waitUntil: 'networkidle2', timeout: 90000 });
                console.log('⏳ Жду 60 секунд после рефреша (загрузка данных)...');
                await wait(60000);

                // 2. Диагностика: что видит браузер
                const diag = await page.evaluate(() => {
                    const cards = document.querySelectorAll('.vm-card');
                    const bodyPreview = document.body.innerText.slice(0, 400);
                    return { cardCount: cards.length, bodyPreview };
                });
                console.log(`🔍 Диагностика: .vm-card найдено = ${diag.cardCount}`);
                if (diag.cardCount === 0) {
                    console.log('📄 Первые 400 символов страницы:');
                    console.log(diag.bodyPreview);
                }

                // 3. Получаем список VM
                const vmInfo = await page.evaluate(() => {
                    const results = [];
                    const cards = document.querySelectorAll('.vm-card');
                    for (let card of cards) {
                        const nameElem = card.querySelector('.vm-info h4');
                        const name = nameElem ? nameElem.innerText : 'Unknown';
                        const timerElem = card.querySelector('.timer-content .countdown');
                        let timeLeft = null;
                        if (timerElem) {
                            const match = timerElem.innerText.match(/(\d{2}):(\d{2})/);
                            if (match) {
                                timeLeft = parseInt(match[1]) + parseInt(match[2]) / 60;
                            }
                        }
                        const hasExtend = Array.from(card.querySelectorAll('button')).some(
                            btn => btn.innerText.toLowerCase().includes('extend')
                        );
                        results.push({ name, timeLeft, hasExtend });
                    }
                    return results;
                });

                console.log(`📟 Найдено VM: ${vmInfo.length}`);
                for (let vm of vmInfo) {
                    console.log(`   - ${vm.name}: осталось ${vm.timeLeft?.toFixed(1) ?? '?'} мин, кнопка продления: ${vm.hasExtend}`);
                }

                // 4. Если VM нет — создаём (с защитой от повторов)
                if (vmInfo.length === 0 && !isCreating && !createdRecently) {
                    console.log('🚀 Нет активных VM, создаю новую (Windows)...');
                    isCreating = true;

                    // Выбираем Windows
                    await page.evaluate(() => {
                        const osBtns = document.querySelectorAll('.os-btn');
                        for (let btn of osBtns) {
                            if (btn.innerText.includes('Windows')) {
                                btn.click();
                                break;
                            }
                        }
                    });
                    await wait(1500);

                    // Кнопка создания
                    const createBtn = await page.$('#createVpsBtn');
                    if (createBtn) {
                        await createBtn.click();
                        await wait(2500);

                        // ToS диалог
                        await page.evaluate(() => {
                            const checkbox = document.getElementById('tosCheckbox');
                            if (checkbox) checkbox.click();
                            const acceptBtn = document.getElementById('acceptTosBtn');
                            if (acceptBtn) acceptBtn.disabled = false;
                            if (acceptBtn) acceptBtn.click();
                        });
                        console.log('✅ Запрос на создание VM отправлен (Windows). Ожидание 3 минуты до следующей проверки.');

                        createdRecently = true;
                        setTimeout(() => { createdRecently = false; }, 180000); // 3 минуты
                    } else {
                        console.log('❌ Не найдена кнопка #createVpsBtn');
                    }

                    setTimeout(() => { isCreating = false; }, 60000);
                }
                // 5. Если VM есть — проверяем время и продлеваем
                else if (vmInfo.length > 0) {
                    const now = Date.now();
                    for (let vm of vmInfo) {
                        if (vm.timeLeft !== null && vm.timeLeft < 4 && (now - lastExtendTime) > 240000) {
                            console.log(`⏰ VM "${vm.name}" — осталось ${vm.timeLeft} мин, продлеваю...`);

                            const clicked = await page.evaluate((vmName) => {
                                const cards = document.querySelectorAll('.vm-card');
                                for (let card of cards) {
                                    const nameElem = card.querySelector('.vm-info h4');
                                    if (nameElem && nameElem.innerText === vmName) {
                                        const btns = card.querySelectorAll('button');
                                        for (let btn of btns) {
                                            if (btn.innerText.toLowerCase().includes('extend')) {
                                                btn.click();
                                                return true;
                                            }
                                        }
                                    }
                                }
                                return false;
                            }, vm.name);

                            if (clicked) {
                                console.log(`✅ VM "${vm.name}" продлена!`);
                                lastExtendTime = now;
                                await wait(3000);
                            } else {
                                console.log(`❌ Не удалось найти кнопку Extend для "${vm.name}"`);
                            }
                        } else if (vm.timeLeft !== null) {
                            console.log(`✅ VM "${vm.name}" — в норме, осталось ${vm.timeLeft.toFixed(1)} мин`);
                        } else {
                            console.log(`⚠️ VM "${vm.name}" — таймер не распознан`);
                        }
                    }
                }

                // 6. Пауза перед следующим циклом
                console.log('⏳ Жду 90 секунд до следующей проверки...');
                await wait(90000);

            } catch (err) {
                console.error('❌ Ошибка в основном цикле:', err.message);
                await wait(60000);
            }
        }

    } catch (err) {
        console.error('❌ Критическая ошибка:', err);
    } finally {
        await browser.close();
    }
}

console.log('🎮 GCP Watchdog запущен на Railway!');
console.log(`📅 Время старта: ${new Date().toISOString()}`);
console.log('🪟 ОС: Windows 2022');
console.log('🔄 Поддерживается 1 VM');
console.log('⏱️  Продление за 4 минуты до конца, пауза после рефреша 60 сек\n');

runWatchdog().catch(console.error);
