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
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu'
        ]
    });
    
    let lastExtendTime = 0;
    let isCreating = false;
    
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });
        
        // === Логин ===
        console.log('🔐 Логинюсь...');
        await page.goto(DASHBOARD_URL, { waitUntil: 'networkidle2', timeout: 30000 });
        await wait(3000);
        
        // Пробуем разные селекторы для логина
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
        
        // Нажимаем кнопку входа
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
        
        await wait(5000);
        console.log('✅ Логин выполнен');
        
        // === ОСНОВНОЙ ЦИКЛ (бесконечный) ===
        while (true) {
            try {
                console.log(`\n📊 [${new Date().toISOString()}] Проверка состояния...`);
                
                // 1. Обновляем страницу
                await page.reload({ waitUntil: 'networkidle2', timeout: 30000 });
                await wait(30000); // Ждём 30 секунд после рефреша
                
                // 2. Проверяем наличие VM
                const vmInfo = await page.evaluate(() => {
                    const vmCards = document.querySelectorAll('.vm-card');
                    const results = [];
                    
                    for (let card of vmCards) {
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
                        
                        // Проверяем, есть ли кнопка Extend
                        const hasExtendBtn = Array.from(card.querySelectorAll('button')).some(
                            btn => btn.innerText.toLowerCase().includes('extend')
                        );
                        
                        results.push({ name, timeLeft, hasExtendBtn });
                    }
                    
                    return results;
                });
                
                console.log(`📟 Найдено VM: ${vmInfo.length}`);
                
                // 3. Если нет VM — создаём
                if (vmInfo.length === 0 && !isCreating) {
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
                    await wait(1000);
                    
                    // Нажимаем кнопку создания
                    const createBtn = await page.$('#createVpsBtn');
                    if (createBtn) {
                        await createBtn.click();
                        await wait(2000);
                        
                        // Принимаем ToS
                        await page.evaluate(() => {
                            const checkbox = document.getElementById('tosCheckbox');
                            if (checkbox) checkbox.click();
                            const acceptBtn = document.getElementById('acceptTosBtn');
                            if (acceptBtn) acceptBtn.disabled = false;
                            if (acceptBtn) acceptBtn.click();
                        });
                        
                        console.log('✅ VM создаётся (подождите 5-10 минут)');
                    }
                    
                    setTimeout(() => { isCreating = false; }, 60000);
                }
                
                // 4. Проверяем таймеры и продлеваем
                const now = Date.now();
                for (let vm of vmInfo) {
                    if (vm.timeLeft !== null && vm.timeLeft < 5 && (now - lastExtendTime) > 240000) {
                        console.log(`⏰ VM "${vm.name}" — осталось ${vm.timeLeft} мин, продлеваю...`);
                        
                        // Нажимаем кнопку Extend на нужной VM
                        const extended = await page.evaluate((vmName) => {
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
                        
                        if (extended) {
                            console.log(`✅ VM "${vm.name}" продлена!`);
                            lastExtendTime = now;
                            await wait(3000);
                        }
                    } else if (vm.timeLeft !== null) {
                        console.log(`✅ VM "${vm.name}" — норм, осталось ${vm.timeLeft.toFixed(1)} мин`);
                    }
                }
                
                // Ждём перед следующей итерацией
                console.log('⏳ Жду 60 секунд до следующей проверки...');
                await wait(60000);
                
            } catch (err) {
                console.error('❌ Ошибка в цикле:', err.message);
                await wait(30000);
            }
        }
        
    } catch (err) {
        console.error('❌ Критическая ошибка:', err);
    } finally {
        await browser.close();
    }
}

// Запускаем
console.log('🎮 GCP Watchdog запущен на Railway!');
console.log(`📅 Время старта: ${new Date().toISOString()}`);
console.log('🪟 ОС: Windows 2022');
console.log('🔄 Поддерживается 1 VM\n');

runWatchdog().catch(console.error);
