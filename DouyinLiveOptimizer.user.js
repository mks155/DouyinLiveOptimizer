// ==UserScript==
// @name         抖音直播优化器 | DouyinLiveOptimizer
// @namespace    https://github.com/mks155
// @homepageURL  https://github.com/mks155/DouyinLiveOptimizer
// @icon         https://raw.githubusercontent.com/mks155/DouyinLiveOptimizer/refs/heads/main/docs/icon.svg
// @version      1.3.1
// @description  首页默认静音、进房自动切最高画质、自动领取看播积分、不弹展馆集星浮层、不弹无操作暂停、画面弹幕悬停 +1、弹幕输入框 ↑↓ 翻历史 | Auto mute, auto best quality, auto claim watch points, no gift-wall popup, no idle-pause popup, on-video danmaku +1, send history on live.douyin.com
// @author       mks155
// @copyright    2026, mks155 (https://github.com/mks155)
// @match        *://live.douyin.com/*
// @grant        unsafeWindow
// @grant        GM_getValue
// @grant        GM_setValue
// @license      Apache-2.0
// @noframes
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    /** 统一标识：日志前缀、DOM id 前缀、配置存储键，都用它 */
    const NS = 'DouyinLiveOptimizer';

    // 顶层只取引用，解析推迟到使用时
    const SELF_SRC = (document.currentScript && document.currentScript.textContent) || '';
    const META = (typeof GM_info !== 'undefined' && GM_info.script) || {};
    const _metaCache = new Map();

    /** 版本号/图标取自元数据：先用 GM_info，其余引擎解析脚本文本 */
    function meta(key) {
        if (_metaCache.has(key)) return _metaCache.get(key);
        let v = '';
        if (key in META) {
            v = META[key] || '';
        } else {
            const m = SELF_SRC && new RegExp('^[ \\t]*//[ \\t]*@' + key + '[ \\t]+(.+?)[ \\t]*$', 'm').exec(SELF_SRC);
            v = m ? m[1] : '';
        }
        _metaCache.set(key, v);
        return v;
    }

    const MAX_HISTORY = 50;
    const QUALITY_AUTO = '';

    // 画质档位从高到低；按名字匹配，不依赖面板顺序
    const QUALITY_RANKS = ['原画', '蓝光', '超清', '高清', '标清', '流畅'];
    // 未登录时高档位带「登录即享」，点了只弹登录框
    const QUALITY_LOCK_HINTS = /登录即享|请先登录|请先登陆|扫码|开通/i;

    // 配色档位：auto 跟随系统，light/dark 强制指定
    const THEME_MODES = ['auto', 'light', 'dark'];
    const THEME_LABEL = { auto: '跟随系统', light: '浅色（白天）', dark: '深色（夜晚）' };
    const THEME_ICON = {
        auto: '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><rect x="2.5" y="4" width="19" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 20.5h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M12 13.5V8.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="7.6" r="1.5" fill="currentColor"/></svg>',
        light: '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><circle cx="12" cy="12" r="4.2" fill="currentColor"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
        dark: '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M20.5 14.2A8.6 8.6 0 0 1 9.8 3.5a8.7 8.7 0 1 0 10.7 10.7z" fill="currentColor"/></svg>'
    };

    const DEFAULT_SETTINGS = {
        // 只作用于 https://live.douyin.com/ 首页（首页大卡片播放器会自动出声）
        muteOnHome: true,
        targetQuality: QUALITY_AUTO,
        enableScreenPlusOne: true,
        enableDanmakuHistory: true,
        // 屏蔽「点亮展馆帮主播集星」浮层（按天生效，复用站点自己的关闭标记）
        enableNoGiftGuide: true,
        // 屏蔽「长时间无操作，即将暂停播放」弹窗（连带它带来的自动暂停）
        enableNoIdlePause: true,
        // 自动领取「看直播领积分」盒子的可领取奖励（走状态判断，不点 DOM）
        enablePointClaim: false,
        themeMode: 'auto'
    };

    // ---------- 深浅模式：驱动官方主题 ----------
    // 持久化 cookie：theme / manual_theme；DOM 标记：<html dark> + <body theme-mode> + meta[theme-color]。
    // 官方按账号设置重刷时不接管其 DOM API，只事后纠正；用户点官方控件才反向同步配置。
    const THEME_COOKIE = 'theme';
    const THEME_MANUAL_COOKIE = 'manual_theme';
    // 官方加载后会按账号设置重刷主题，轮询要跟上
    const THEME_WATCH_MS = 700;

    function readCookie(name) {
        const m = document.cookie.match(new RegExp('(?:^|;\\s*)' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)'));
        return m ? decodeURIComponent(m[1]) : '';
    }
    function writeCookie(name, value) {
        try {
            document.cookie =
                name + '=' + encodeURIComponent(value) + '; path=/; domain=.douyin.com; max-age=' + 400 * 24 * 3600;
        } catch (e) {
        }
    }
    function clearCookie(name) {
        try {
            document.cookie = name + '=; path=/; domain=.douyin.com; max-age=0';
        } catch (e) {
        }
    }

    class OfficialTheme {
        constructor(settings) {
            this.settings = settings;
            this.mq = null;
            this.mqHandler = null;
            this.timer = 0;
            this.domObserver = null;
            this.watched = new WeakSet();
            this.reassertAt = 0;
            this.reassertCount = 0;
            this.reassertTotal = 0;
        }
        update(s) {
            this.settings = s;
            this.apply();
        }
        /** auto 读系统主题，light/dark 直接判定 */
        isDark() {
            const mode = this.settings.themeMode;
            if (mode === 'light') return false;
            if (mode === 'dark') return true;
            try {
                return window.matchMedia('(prefers-color-scheme: dark)').matches;
            } catch (e) {
                return true;
            }
        }
        /** 与官方主题模块一致的 DOM 标记 */
        paint(isDark) {
            try {
                const html = document.documentElement;
                const body = document.body;
                const dark = document.getElementById('dark');
                if (isDark) {
                    html.setAttribute('dark', 'true');
                    body.setAttribute('theme-mode', 'dark');
                } else {
                    html.removeAttribute('dark');
                    if (body.hasAttribute('theme-mode')) body.removeAttribute('theme-mode');
                    if (dark) dark.removeAttribute('id');
                }
                const meta = document.querySelector('meta[name="theme-color"]');
                if (meta) meta.setAttribute('content', isDark ? '#161823' : '#ffffff');
                localStorage.setItem('ELECTRON_THEME_KEY', isDark ? 'DARK' : '');
            } catch (e) {
            }
        }
        /** 官方只有浅/深两档；auto 时 manual_theme 留空，表示用户没手动选过 */
        target() {
            const v = this.isDark() ? 'dark' : 'light';
            return { theme: v, manual: this.settings.themeMode === 'auto' ? '' : v };
        }
        /** 只写不一致的项，避免 cookie 每轮都被写 */
        writeTarget() {
            const t = this.target();
            if (readCookie(THEME_COOKIE) !== t.theme) writeCookie(THEME_COOKIE, t.theme);
            if (t.manual) {
                if (readCookie(THEME_MANUAL_COOKIE) !== t.manual) writeCookie(THEME_MANUAL_COOKIE, t.manual);
            } else if (readCookie(THEME_MANUAL_COOKIE)) {
                clearCookie(THEME_MANUAL_COOKIE);
            }
        }
        /** DOM 是否已符合脚本档位 */
        domMatches() {
            const wantDark = this.isDark();
            const htmlDark = document.documentElement.hasAttribute('dark');
            const bodyDark = !!(document.body && document.body.getAttribute('theme-mode') === 'dark');
            return htmlDark === wantDark && bodyDark === wantDark;
        }
        apply() {
            this.paint(this.isDark());
            this.writeTarget();
            this.watchSystem();
            this.installDomHooks();
        }
        /**
         * 官方会按服务端账号设置重刷 html[dark] / body[theme-mode]，来源拦不住，
         * 只做事后纠正（不改写页面 DOM API）并限频。document-start 时元素可能为 null，故谁出现挂谁。
         */
        installDomHooks() {
            if (!this.domObserver) {
                this.domObserver = new MutationObserver(() => this.reassert());
            }
            const watch = (el) => {
                if (!el || this.watched.has(el)) return false;
                this.watched.add(el);
                try {
                    this.domObserver.observe(el, { attributes: true, attributeFilter: ['dark', 'theme-mode'] });
                } catch (e) {
                    return false;
                }
                return true;
            };
            let installed = watch(document.documentElement);
            if (watch(document.body)) installed = true;
            if (installed) this.reassert();
            // 元素还没出来就重试，挂齐即停
            if (!(document.documentElement && document.body) && !this.hookTimer) {
                let n = 0;
                const tick = () => {
                    this.hookTimer = 0;
                    this.installDomHooks();
                    if (document.documentElement && document.body) return;
                    if (++n > 300) return;
                    this.hookTimer = setTimeout(tick, 10);
                };
                this.hookTimer = setTimeout(tick, 10);
            }
        }
        /** 纠正官方写歪的主题标记：每秒最多 8 次、累计 200 次，防止反复触发拖死主线程 */
        reassert() {
            if (this.domMatches()) return;
            if (this.reassertTotal >= 200) {
                if (this.timer) {
                    clearInterval(this.timer);
                    this.timer = 0;
                }
                this.domObserver?.disconnect();
                this.domObserver = null;
                log('主题纠正次数过多，停止强制，交给官方自己控制');
                return;
            }
            const now = Date.now();
            if (now - this.reassertAt > 1000) {
                this.reassertAt = now;
                this.reassertCount = 0;
            }
            if (++this.reassertCount > 8) return;
            this.reassertTotal += 1;
            this.paint(this.isDark());
        }
        /** auto 档跟随系统主题变化 */
        watchSystem() {
            if (this.settings.themeMode !== 'auto') {
                this.unwatchSystem();
                return;
            }
            if (this.mq) return;
            try {
                this.mq = window.matchMedia('(prefers-color-scheme: dark)');
                this.mqHandler = () => this.apply();
                if (this.mq.addEventListener) this.mq.addEventListener('change', this.mqHandler);
                else if (this.mq.addListener) this.mq.addListener(this.mqHandler);
            } catch (e) {
            }
        }
        unwatchSystem() {
            if (!this.mq) return;
            try {
                if (this.mq.removeEventListener) this.mq.removeEventListener('change', this.mqHandler);
                else if (this.mq.removeListener) this.mq.removeListener(this.mqHandler);
            } catch (e) {
            }
            this.mq = null;
            this.mqHandler = null;
        }
        /** 用户在官方 UI 改了主题 → 同步脚本配置 */
        adopt(mode) {
            if (mode === this.settings.themeMode) return;
            this.settings.themeMode = mode;
            saveSettings(this.settings);
            this.onModeChanged?.(mode);
            log('官方主题已变更，脚本配置同步为', mode);
            this.apply();
        }
        /** 用 document 捕获阶段事件委托识别官方主题控件（hover 才渲染、可能在 portal 里），用户真点了才同步 */
        watchOfficialToggle() {
            if (this.toggleBound) return;
            this.toggleBound = true;
            const LABEL = /^(深色模式|浅色模式|经典模式|深浅模式|背景设置|夜间模式|白天模式|主题)$/;
            const modeOf = (el) => {
                let node = el;
                for (let i = 0; i < 4 && node; i++) {
                    if (node.nodeType === 1) {
                        const label = ((node.getAttribute('title') || '') + ' ' + (node.getAttribute('aria-label') || '')).trim();
                        const text = (node.textContent || '').trim();
                        const hit = LABEL.test(label) ? label : text.length <= 8 && LABEL.test(text) ? text : '';
                        if (hit) {
                            if (/深色|夜间/.test(hit)) return 'dark';
                            if (/浅色|白天/.test(hit)) return 'light';
                            return ''; // 经典模式/背景设置之类，脚本没有对应档位，不猜
                        }
                    }
                    node = node.parentElement;
                }
                return '';
            };
            document.addEventListener(
                'click',
                (e) => {
                    const target = e.target && e.target.nodeType === 1 ? e.target : e.target && e.target.parentElement;
                    if (!target) return;
                    const mode = modeOf(target);
                    if (mode) this.adopt(mode);
                },
                true
            );
        }
        /** 脚本是主题的唯一主：轮询只把 DOM 保持在脚本档位，不按 cookie 反推用户意图 */
        reconcile() {
            this.installDomHooks();
            if (!this.domMatches()) this.paint(this.isDark());
        }
        startWatch() {
            if (this.timer) return;
            this.timer = setInterval(() => this.reconcile(), THEME_WATCH_MS);
        }
    }

    // 页面选择器（live.douyin.com）：
    //   画质档位 [data-e2e="quality"]，下拉 [data-e2e="quality-selector"]
    //   发送框/按钮 .webcast-chatroom___textarea / .webcast-chatroom___send-btn
    // 画面弹幕画在 canvas 上，没有 DOM 节点。
    const SEL = {
        qualityLabel: '[data-e2e="quality"]',
        qualityList: '[data-e2e="quality-selector"]',
        // 登录态聊天框是 contenteditable，容器里还有表情搜索 input，可编辑区域必须排前面
        inputCandidates: [
            '.webcast-chatroom___textarea',
            '.webcast-chatroom___input-container [contenteditable="true"]',
            '.webcast-chatroom___input-container textarea',
            '.webcast-chatroom___input-container input:not([type="search"])',
            '[data-e2e="room-chat-input"]',
            '[data-e2e="chat-input"]'
        ],
        sendBtnCandidates: ['.webcast-chatroom___send-btn', '.webcast-chatroom___enter']
    };

    // ---------- storage ----------
    const store = {
        get(key, fallback) {
            try {
                const raw = GM_getValue(key, null);
                return raw == null ? fallback : raw;
            } catch (e) {
                return fallback;
            }
        },
        set(key, value) {
            try {
                GM_setValue(key, value);
                return true;
            } catch (e) {
                return false;
            }
        }
    };

    function loadStore() {
        const raw = store.get(NS, null);
        // 部分脚本管理器会把对象序列化成 JSON 字符串
        if (typeof raw === 'string') {
            try {
                return JSON.parse(raw) || {};
            } catch (e) {
                return {};
            }
        }
        return raw && typeof raw === 'object' ? raw : {};
    }
    function saveStore(patch) {
        const next = Object.assign(loadStore(), patch);
        store.set(NS, next);
        return next;
    }

    function loadSettings() {
        const d = loadStore();
        return {
            muteOnHome: d.muteOnHome ?? DEFAULT_SETTINGS.muteOnHome,
            targetQuality: d.targetQuality ?? DEFAULT_SETTINGS.targetQuality,
            enableScreenPlusOne: d.enableScreenPlusOne ?? DEFAULT_SETTINGS.enableScreenPlusOne,
            enableDanmakuHistory: d.enableDanmakuHistory ?? DEFAULT_SETTINGS.enableDanmakuHistory,
            enableNoGiftGuide: d.enableNoGiftGuide ?? DEFAULT_SETTINGS.enableNoGiftGuide,
            enableNoIdlePause: d.enableNoIdlePause ?? DEFAULT_SETTINGS.enableNoIdlePause,
            enablePointClaim: d.enablePointClaim ?? DEFAULT_SETTINGS.enablePointClaim,
            themeMode: THEME_MODES.includes(d.themeMode) ? d.themeMode : DEFAULT_SETTINGS.themeMode
        };
    }
    function saveSettings(s) {
        saveStore({
            muteOnHome: s.muteOnHome,
            targetQuality: s.targetQuality,
            enableScreenPlusOne: s.enableScreenPlusOne,
            enableDanmakuHistory: s.enableDanmakuHistory,
            enableNoGiftGuide: s.enableNoGiftGuide,
            enableNoIdlePause: s.enableNoIdlePause,
            enablePointClaim: s.enablePointClaim,
            themeMode: s.themeMode
        });
    }

    function loadHistory() {
        const list = loadStore().danmakuHistory;
        if (Array.isArray(list)) return list.filter((x) => typeof x === 'string' && x.trim());
        // 历史兼容：也可能以 JSON 文本形式存储
        if (typeof list === 'string') {
            try {
                const arr = JSON.parse(list);
                if (Array.isArray(arr)) return arr.filter((x) => typeof x === 'string' && x.trim());
            } catch (e) {
            }
        }
        return [];
    }
    function saveHistory(list) {
        saveStore({ danmakuHistory: list.slice(-MAX_HISTORY) });
    }

    // ---------- utils ----------
    const log = (...a) => console.log(`[${NS}]`, ...a);
    const warn = (...a) => console.warn(`[${NS}]`, ...a);
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    function queryOne(selectors, root = document) {
        const list = Array.isArray(selectors) ? selectors : [selectors];
        for (const sel of list) {
            try {
                const el = root.querySelector(sel);
                if (el) return el;
            } catch (e) {
            }
        }
        return null;
    }
    function queryAll(selector, root = document) {
        try {
            return Array.from(root.querySelectorAll(selector));
        } catch (e) {
            return [];
        }
    }
    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
    function waitFor(fn, { timeout = 8000, interval = 250, label = 'cond' } = {}) {
        return new Promise((resolve, reject) => {
            const start = Date.now();
            const tick = () => {
                let ok = false;
                try {
                    ok = !!fn();
                } catch (e) {
                    ok = false;
                }
                if (ok) return resolve(true);
                if (Date.now() - start >= timeout) return reject(new Error(`timeout: ${label}`));
                setTimeout(tick, interval);
            };
            tick();
        });
    }
    function setNativeValue(el, value) {
        if (!el) return false;
        if (el.isContentEditable) {
            el.focus();
            // contenteditable 改 textContent 会被编辑器状态机清空，走 execCommand 才有 input 事件
            let ok = false;
            try {
                if (typeof document.execCommand === 'function') {
                    const sel = window.getSelection();
                    const range = document.createRange();
                    range.selectNodeContents(el);
                    sel.removeAllRanges();
                    sel.addRange(range);
                    ok = document.execCommand('insertText', false, value);
                }
            } catch (e) {
            }
            if (!ok) {
                el.textContent = value;
                el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: value }));
            }
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
        }
        const desc =
            Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value') ||
            Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value') ||
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
        // React 受控组件只认原型上的原生 setter
        if (desc?.set) desc.set.call(el, value);
        else el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    }
    function readInputValue(el) {
        if (!el) return '';
        const raw = el.isContentEditable ? el.textContent || '' : el.value || '';
        // 编辑器会在末尾塞零宽空格，trim 去不掉，先清掉再判空
        return raw.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
    }
    /** React 组件的 onClick 必须直接调用；el.click() 派发的事件 React 收不到 */
    function reactClick(el) {
        if (!el) return false;
        const key = Object.keys(el).find((k) => k.startsWith('__reactProps') || k.startsWith('__reactInternalInstance'));
        if (!key) return false;
        let props = el[key];
        if (!props || typeof props !== 'object') {
            // 旧版 fiber：从 __reactInternalInstance 往上取 memoizedProps
            let fiber = el[key];
            let depth = 0;
            while (fiber && depth < 6) {
                props = fiber.memoizedProps || {};
                if (props && typeof props.onClick === 'function') break;
                fiber = fiber.return;
                depth += 1;
            }
        }
        const fn = props && props.onClick;
        if (typeof fn !== 'function') return false;
        try {
            fn({
                type: 'click',
                preventDefault() {},
                stopPropagation() {},
                isDefaultPrevented: () => false,
                isPropagationStopped: () => false,
                bubbles: true,
                cancelable: true,
                currentTarget: el,
                target: el,
                nativeEvent: { isTrusted: true, stopPropagation() {}, preventDefault() {} }
            });
            return true;
        } catch (e) {
            warn('reactClick 调用出错', e);
            return false;
        }
    }
    function scheduleIdle(fn, timeout = 4000) {
        if (typeof requestIdleCallback === 'function') requestIdleCallback(() => fn(), { timeout });
        else setTimeout(fn, Math.min(timeout, 2500));
    }

    function findDanmakuInput() {
        return queryOne(SEL.inputCandidates);
    }
    function findSendBtn() {
        return queryOne(SEL.sendBtnCandidates);
    }

    // SPA 站：进出直播间不刷新页面，功能靠 URL 轮询在路由变化时重跑
    function isHome() {
        return location.hostname === 'live.douyin.com' && location.pathname === '/';
    }
    function isRoom() {
        return location.hostname === 'live.douyin.com' && location.pathname !== '/';
    }

    // ---------- 功能 1：首页默认静音 ----------
    // 只在首页静音，每个媒体元素只处理一次；用户手动开声后不再强制
    const mutedOnce = new WeakSet();
    let muteObserver = null;

    function muteMedia(el) {
        if (!el || mutedOnce.has(el)) return false;
        mutedOnce.add(el);
        try {
            el.muted = true;
        } catch (e) {
            return false;
        }
        return true;
    }

    function muteExistingMedia() {
        let n = 0;
        queryAll('video, audio').forEach((el) => {
            if (muteMedia(el)) n += 1;
        });
        return n;
    }

    function stopMute() {
        muteObserver?.disconnect();
        muteObserver = null;
    }

    function startHomeMute() {
        if (!isHome()) {
            stopMute();
            return;
        }
        const n = muteExistingMedia();
        log(`首页静音：本次处理 ${n} 个媒体元素`);
        // 首页是无限滚动卡片流，新出现的播放器也要静音
        if (muteObserver) return;
        try {
            muteObserver = new MutationObserver((records) => {
                for (const rec of records) {
                    rec.addedNodes.forEach((node) => {
                        if (!(node instanceof Element)) return;
                        if (node.matches?.('video, audio')) muteMedia(node);
                        queryAll('video, audio', node).forEach(muteMedia);
                    });
                }
            });
            muteObserver.observe(document.documentElement, { childList: true, subtree: true });
        } catch (e) {
            warn('首页静音监听失败', e);
        }
    }

    // ---------- 功能 2：自动最高画质 ----------
    function currentQuality() {
        return (queryOne(SEL.qualityLabel)?.textContent || '').trim();
    }

    function readQualityTiers() {
        const list = queryOne(SEL.qualityList);
        if (!list) return [];
        return queryAll(':scope > div', list)
            .map((el) => {
                const raw = (el.textContent || '').replace(/\s+/g, ' ').trim();
                // 「原画登录即享」→「原画」
                const name = (raw.replace(QUALITY_LOCK_HINTS, '') || raw).trim();
                return {
                    el,
                    raw,
                    name,
                    locked: QUALITY_LOCK_HINTS.test(raw),
                    selected: /background/.test(el.firstElementChild?.getAttribute?.('style') || '')
                };
            })
            .filter((t) => t.name);
    }

    function rankOf(name) {
        const i = QUALITY_RANKS.findIndex((q) => name.includes(q));
        return i < 0 ? QUALITY_RANKS.length : i;
    }

    class QualityOptimizer {
        constructor(settings) {
            this.settings = settings;
            this.targetText = '';
            this.done = false;
            this.running = false;
        }

        updateSettings(s) {
            this.settings = s;
            this.done = false;
            this.targetText = '';
        }

        pickTarget(tiers) {
            const usable = tiers.filter((t) => !t.locked);
            if (!usable.length) return null;

            const want = (this.settings.targetQuality || '').trim();
            if (want) {
                const hit = usable.find((t) => t.name.includes(want));
                if (hit) return hit;
                warn(`画质「${want}」本房间不可用，回退最高可用档`);
            }
            // 面板顺序不可靠，按档位名再兜一次底
            return usable.reduce((best, t) => (best === null || rankOf(t.name) < rankOf(best.name) ? t : best), null);
        }

        isSettled() {
            return this.done && !!this.targetText && currentQuality().includes(this.targetText);
        }

        async attempt() {
            const tiers = await waitFor(() => readQualityTiers().length, {
                timeout: 8000,
                interval: 400,
                label: 'quality list'
            })
                .then(readQualityTiers)
                .catch(() => readQualityTiers());
            if (!tiers.length) return false;

            const target = this.pickTarget(tiers);
            if (!target) {
                // 全是锁定档就别点了，点只会弹登录框
                warn('所有画质档都需登录，跳过自动切换', tiers.map((t) => t.name));
                this.done = true;
                return true;
            }

            this.targetText = target.name;
            if (target.selected || currentQuality().includes(target.name)) {
                log(`画质已是最高可用档：${target.name}`);
                this.done = true;
                return true;
            }

            // 下拉面板常驻 DOM（收起时宽度 0），可直接调 React onClick
            if (!reactClick(target.el)) target.el.click();
            log(`请求切换画质：${target.name}（当前 ${currentQuality() || '?'}）`);

            const ok = await waitFor(() => currentQuality().includes(target.name), {
                timeout: 6000,
                interval: 300,
                label: `quality ${target.name}`
            })
                .then(() => true)
                .catch(() => false);
            this.done = ok;
            if (ok) log(`画质已切到：${target.name}`);
            else warn(`画质未切上：想要 ${target.name}，现在 ${currentQuality() || '?'}`);
            return ok;
        }

        async run() {
            if (this.running) return;
            this.running = true;
            try {
                const budget = Date.now() + 30000;
                let rounds = 0;
                do {
                    rounds += 1;
                    if (await this.attempt()) break;
                    await sleep(2500);
                } while (Date.now() < budget && !this.isSettled());
                log('画质处理结束', { 轮数: rounds, 画质: currentQuality() || '?', 目标: this.targetText || '-' });
            } catch (e) {
                warn('画质处理出错', e);
            } finally {
                this.running = false;
            }
        }
    }

    // ---------- 功能 3 & 4：弹幕 +1 / 发送历史 ----------
    const historyStore = {
        list: loadHistory(),
        index: -1,
        draft: '',
        push(text) {
            const v = (text || '').trim();
            if (!v) return;
            // 只跟最后一条去重，不然复读同一句会被当重复丢掉
            if (this.list[this.list.length - 1] === v) {
                this.index = -1;
                this.draft = '';
                return;
            }
            this.list.push(v);
            if (this.list.length > MAX_HISTORY) this.list = this.list.slice(-MAX_HISTORY);
            saveHistory(this.list);
            this.index = -1;
            this.draft = '';
        }
    };

    function sendDanmaku(text) {
        const value = (text || '').trim();
        if (!value) return false;
        const input = findDanmakuInput();
        if (!input) {
            warn('发送框没找到（未登录时抖音不渲染聊天框）');
            return false;
        }
        input.focus();
        setNativeValue(input, value);
        // 等编辑器内容真正回填后再点发送
        let tries = 0;
        const tick = () => {
            const cur = readInputValue(input);
            if (cur === value || (tries >= 6 && cur.includes(value))) {
                const btn = findSendBtn();
                if (btn) {
                    if (!reactClick(btn)) btn.click();
                } else {
                    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
                }
                historyStore.push(value);
                return;
            }
            tries += 1;
            if (tries < 20) setTimeout(tick, 50);
            else warn('弹幕回填失败，未发送：' + value);
        };
        setTimeout(tick, 50);
        return true;
    }

    class DanmakuHistory {
        constructor(settings) {
            this.settings = settings;
            this.bound = false;
            // 最近一次输入的内容，发送成功时入历史
            this.pending = '';
            // 轮询到的输入框内容，用来发现「被清空」= 发送成功
            this.seen = '';
            this.timer = 0;
        }
        update(s) {
            this.settings = s;
        }
        isInput(el) {
            if (!el) return false;
            const tag = el.tagName;
            if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !el.isContentEditable) return false;
            // 顶部搜索框不是聊天输入框，别把它当弹幕框
            if (el.closest?.('[data-e2e="searchbar-input"], [data-e2e="searchbar"]')) return false;
            if (tag === 'INPUT' && el.type === 'search') return false;
            // 已知的聊天输入框
            if (el.closest?.('.webcast-chatroom___input-container')) return true;
            if (el.matches?.(SEL.inputCandidates.join(','))) return true;
            // 兜底：聊天区域内的可编辑元素
            if (el.closest?.('.webcast-chatroom, [class*="chatroom"], [class*="chat-room"]')) return true;
            return findDanmakuInput() === el;
        }
        caretEnd(el) {
            try {
                if (el.isContentEditable) {
                    const r = document.createRange();
                    r.selectNodeContents(el);
                    r.collapse(false);
                    const s = window.getSelection();
                    s.removeAllRanges();
                    s.addRange(r);
                } else if (el.setSelectionRange) {
                    const n = el.value.length;
                    el.setSelectionRange(n, n);
                }
                el.focus();
            } catch (e) {
            }
        }

        /** 发送成功，入历史。el 传用户真正输入的那个元素，别重新查 DOM 取错对象 */
        commit(el) {
            if (this.settings.enableDanmakuHistory === false) return;
            const v = (el ? readInputValue(el) : '') || this.pending || readInputValue(findDanmakuInput());
            this.pending = '';
            historyStore.push(v);
        }

        /** 输入框被清空 = 发送成功（React 直接改 value、不触发 input，只能轮询） */
        startWatch() {
            if (this.timer) return;
            this.timer = setInterval(() => {
                if (this.settings.enableDanmakuHistory === false) return;
                const el = findDanmakuInput();
                if (!el) {
                    this.seen = '';
                    return;
                }
                const cur = readInputValue(el);
                if (this.seen && !cur) {
                    historyStore.push(this.seen);
                    this.pending = '';
                }
                this.seen = cur;
            }, 250);
        }

        bind() {
            if (this.bound) return;
            this.bound = true;

            // --- 记录「待发送的内容」---
            document.addEventListener(
                'input',
                (e) => {
                    if (this.settings.enableDanmakuHistory === false) return;
                    if (!this.isInput(e.target)) return;
                    const v = readInputValue(e.target);
                    if (v) {
                        this.pending = v;
                        this.seen = v;
                    } else {
                        // 用户自己删空的，那不是发送，别记进历史
                        this.pending = '';
                        this.seen = '';
                    }
                },
                true
            );

            // --- 出口 1：回车发送 ---
            // 输入法上屏的回车 isComposing 为 true，但抖音照样发出，不能跳过
            document.addEventListener(
                'keydown',
                (e) => {
                    if (e.key !== 'Enter' || e.shiftKey) return;
                    if (!this.isInput(e.target)) return;
                    this.commit(e.target);
                },
                true
            );

            // --- 出口 2：输入法上屏 ---
            document.addEventListener(
                'compositionend',
                (e) => {
                    if (!this.isInput(e.target)) return;
                    this.commit(e.target);
                },
                true
            );

            // --- 出口 3：点发送按钮 ---
            document.addEventListener(
                'click',
                (e) => {
                    const t = e.target;
                    if (!t?.closest) return;
                    if (!t.closest(SEL.sendBtnCandidates.join(','))) return;
                    this.commit(findDanmakuInput());
                },
                true
            );

            // --- 出口 4：输入框被清空（万能兜底）---
            this.startWatch();

            // --- 上下键翻历史 ---
            document.addEventListener(
                'keydown',
                (e) => {
                    if (this.settings.enableDanmakuHistory === false) return;
                    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
                    const input = e.target;
                    if (!this.isInput(input)) return;
                    // 中文输入法组字期间，上下键是选词不是翻历史，抢了就打不出字
                    if (e.isComposing || input.composing) return;
                    if (!historyStore.list.length) return;

                    e.preventDefault();
                    e.stopPropagation();

                    if (e.key === 'ArrowUp') {
                        if (historyStore.index === -1) {
                            historyStore.draft = readInputValue(input);
                            historyStore.index = historyStore.list.length - 1;
                        } else if (historyStore.index > 0) {
                            historyStore.index -= 1;
                        }
                    } else {
                        if (historyStore.index === -1) return;
                        if (historyStore.index < historyStore.list.length - 1) {
                            historyStore.index += 1;
                        } else {
                            // 翻到最新一条之后再往下，回到刚才没翻之前的内容
                            historyStore.index = -1;
                            setNativeValue(input, historyStore.draft);
                            this.caretEnd(input);
                            return;
                        }
                    }
                    setNativeValue(input, historyStore.list[historyStore.index] || '');
                    this.caretEnd(input);
                },
                true
            );
        }
    }

    // ---------- 画面弹幕：worker 注入 + 命中层 ----------
    // 画面弹幕由 CanvasDanmakuPlugin 画在 OffscreenCanvas 上、worker 渲染，主线程拿不到文本和坐标；
    // 站方用 Blob(importScripts) 建 worker，劫持 Blob 注入补丁，hook fillText 后经 BroadcastChannel 回传。
    const BC_NAME = '__dlo_danmaku_v1__';

    const WORKER_PATCH = `
;try{
var __ch = new BroadcastChannel(${JSON.stringify(BC_NAME)});
var __P = OffscreenCanvasRenderingContext2D.prototype;
var __of = __P.fillText, __os = __P.strokeText, __oc = __P.clearRect;
var __ctxs = [], __timer = 0;
/* 被钉住的弹幕：主线程指定坐标后画在固定位置，其它弹幕照常飘 */
var __pin = null, __pinCtx = null, __pinFont = null, __pinColor = null;
function __report(txt, x, y){
  var arr = null, i;
  for(i=0;i<__ctxs.length;i++){ if(__ctxs[i].c === this){ arr = __ctxs[i].a; break; } }
  if(!arr){ arr = []; __ctxs.push({c:this, a:arr}); }
  var cv = this.canvas || null;
  var w = 0;
  try{ w = this.measureText(txt).width || 0; }catch(e){}
  arr.push([txt, x, y, this.font, (cv&&cv.width)||0, (cv&&cv.height)||0, w]);
  if(!__timer) __timer = setTimeout(__flush, 0);
}
var __flush = function(){
  __timer = 0;
  var out = [];
  try{
    for(var i=0;i<__ctxs.length;i++){
      var a = __ctxs[i].a;
      for(var j=0;j<a.length;j++) out.push(a[j]);
      a.length = 0;
    }
    if(out.length) __ch.postMessage({k:'f', items:out});
  }catch(e){}
};
__P.fillText = function(t,x,y,m){
  var txt = String(t);
  try{
    if(__pin && txt === __pin.t){
      // 记下字体/颜色，clearRect 后重绘用
      __pinCtx = this; __pinFont = this.font; __pinColor = this.fillStyle;
      __of.call(this, txt, __pin.x, __pin.y, m);
      __report.call(this, txt, __pin.x, __pin.y);
      return;
    }
  }catch(e){}
  __of.call(this, txt, x, y, m);
  try{ __report.call(this, txt, x, y); }catch(e){}
};
__P.strokeText = function(t,x,y,m){
  var txt = String(t);
  try{
    if(__pin && txt === __pin.t){
      __os.call(this, txt, __pin.x, __pin.y, m);
      return;
    }
  }catch(e){}
  __os.call(this, txt, x, y, m);
};
__P.clearRect = function(){
  try{
    for(var i=0;i<__ctxs.length;i++){ if(__ctxs[i].c === this){ __ctxs[i].a.length = 0; break; } }
  }catch(e){}
  var r = __oc.apply(this, arguments);
  try{
    /* 每帧清屏后重绘钉住的那条：站方会把它判为过期、不再绘制 */
    if(__pin && __pinCtx === this){
      this.save();
      if(__pinFont) this.font = __pinFont;
      if(__pinColor) this.fillStyle = __pinColor;
      __of.call(this, __pin.t, __pin.x, __pin.y);
      this.restore();
      __report.call(this, __pin.t, __pin.x, __pin.y);
    }
  }catch(e){}
  return r;
};
/* 主线程的命令：钉住 / 放开 */
__ch.onmessage = function(e){
  try{
    var d = e.data || {};
    if(d.k === 'pin'){ __pin = {t: d.t, x: d.x, y: d.y}; __pinCtx = null; __pinFont = d.font || null; __pinColor = null; }
    else if(d.k === 'unpin'){ __pin = null; __pinCtx = null; __pinFont = null; __pinColor = null; }
  }catch(_){}
};
__ch.postMessage({k:'ready'});
}catch(e){}
`;

    function pageWindow() {
        try {
            return typeof unsafeWindow !== 'undefined' && unsafeWindow ? unsafeWindow : window;
        } catch (e) {
            return window;
        }
    }

    /** 劫持 Blob 构造器注入 worker 补丁；必须在 document-start 执行，播放器在 load 前就建好 worker */
    function installDanmakuWorkerHook() {
        const W = pageWindow();
        try {
            if (!W || !W.Blob) return false;
            if (W.Blob.__dloPatched) return true;
            const OrigBlob = W.Blob;
            const Patched = new Proxy(OrigBlob, {
                construct(target, args, newTarget) {
                    try {
                        const parts = args[0];
                        const type = (args[1] && args[1].type) || '';
                        // 只改站方建 worker 用的那种 blob，别的不碰
                        if (
                            Array.isArray(parts) &&
                            parts.length === 1 &&
                            typeof parts[0] === 'string' &&
                            parts[0].indexOf('importScripts(') >= 0 &&
                            /javascript/i.test(type)
                        ) {
                            args[0] = [parts[0] + WORKER_PATCH];
                        }
                    } catch (e) {
                    }
                    return Reflect.construct(target, args, newTarget);
                }
            });
            Patched.__dloPatched = true;
            W.Blob = Patched;
            log('弹幕 worker 钩子已就位');
            return true;
        } catch (e) {
            warn('弹幕 worker 钩子安装失败', e);
            return false;
        }
    }

    /** 画面弹幕 +1：worker 回传文本与坐标，主线程做命中测试 */
    class ScreenDanmakuPlusOne {
        constructor(settings) {
            this.settings = settings;
            this.items = [];
            this.ch = null;
            this.bar = null;
            this.hover = null;
            this.gotData = false;
            this.pinned = ''; // 当前被钉住的那条弹幕
            this.hideTimer = 0;
        }
        update(s) {
            this.settings = s;
            if (s.enableScreenPlusOne === false) this.hide();
        }
        enabled() {
            return this.settings.enableScreenPlusOne !== false;
        }

        bind() {
            try {
                // BroadcastChannel 建在页面 realm：worker 也在页面 realm，沙箱跨 realm 不一定通
                const BC = pageWindow().BroadcastChannel || BroadcastChannel;
                this.ch = new BC(BC_NAME);
                this.ch.onmessage = (e) => this.onMessage(e.data);
            } catch (e) {
                warn('BroadcastChannel 不可用，画面弹幕 +1 将失效', e);
            }
            document.addEventListener('mousemove', (e) => this.onMove(e), { capture: true, passive: true });
            document.addEventListener('mouseout', (e) => {
                if (!e.relatedTarget) this.hide();
            }, { capture: true, passive: true });
            // 滚动只重新定位按钮，不解除钉定
            document.addEventListener('scroll', () => this.reposition(), { capture: true, passive: true });
            window.addEventListener('resize', () => this.reposition(), { passive: true });
            window.addEventListener('blur', () => this.hide());
            document.addEventListener('visibilitychange', () => {
                if (document.hidden) this.hide();
            });
        }

        /** 画布位置变了（滚动/缩放）就把按钮挪过去，钉定保持不变 */
        reposition() {
            if (!this.hover) return;
            const cv = this.canvas();
            if (!cv) return;
            const rect = cv.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            this.hover.rect = rect;
            const group = this.pickGroup();
            if (group && group.length) {
                const cw = group[0][4] || cv.width || rect.width;
                const chh = group[0][5] || cv.height || rect.height;
                this.hover.sx = cw / rect.width;
                this.hover.sy = chh / rect.height;
            }
            this.placeBar();
        }

        onMessage(data) {
            if (!data) return;
            if (data.k !== 'f' || !Array.isArray(data.items)) return;
            this.gotData = true;
            this.items = data.items;
        }

        /** 钉住弹幕：让 worker 画在固定位置（BroadcastChannel 通知，不碰 worker 实例） */
        pin(text, x, y, font) {
            if (!this.ch || !text) return;
            try {
                this.ch.postMessage({ k: 'pin', t: text, x, y, font: font || '' });
            } catch (e) {
            }
        }
        unpin() {
            if (!this.ch) return;
            try {
                this.ch.postMessage({ k: 'unpin' });
            } catch (e) {
            }
        }

        /** 弹幕画布：站方插件容器里的那个 canvas */
        canvas() {
            return queryOne('.CanvasDanmakuPlugin canvas');
        }

        /** 一帧里可能有多个 canvas（动态背景也画字）：按尺寸匹配，匹配不上取条目最多的一组 */
        pickGroup() {
            if (!this.items.length) return null;
            const cv = this.canvas();
            if (cv) {
                // worker 报的是绘制面尺寸（配置宽高 × dpr），元素 width/height 未必同步，两种都试
                const dpr = window.devicePixelRatio || 1;
                const cands = [
                    [cv.width, cv.height],
                    [Math.round(cv.width * dpr), Math.round(cv.height * dpr)]
                ];
                for (const [w, h] of cands) {
                    const exact = this.items.filter((it) => it[4] === w && it[5] === h);
                    if (exact.length) return exact;
                }
            }
            // 兜底：worker 里只有弹幕画布（动态背景在主线程画），取条目最多的那组
            const groups = new Map();
            for (const it of this.items) {
                const key = it[4] + 'x' + it[5];
                groups.set(key, (groups.get(key) || 0) + 1);
            }
            let best = null;
            let bestN = 0;
            for (const it of this.items) {
                const key = it[4] + 'x' + it[5];
                const n = groups.get(key);
                if (n > bestN) {
                    bestN = n;
                    best = key;
                }
            }
            return this.items.filter((it) => it[4] + 'x' + it[5] === best);
        }

        /** 命中测试：画布设备像素坐标 */
        pick(px, py) {
            const group = this.pickGroup();
            if (!group) return null;
            let hit = null;
            for (const it of group) {
                const [text, x, y, font, cw, chh, w] = it;
                if (!text) continue;
                const size = parseFloat(String(font).match(/(\d+(?:\.\d+)?)px/)?.[1] || '20');
                // 站方 textBaseline = 'top'，所以 y 就是文字顶端
                const top = y;
                const bottom = y + size * 1.25;
                if (px >= x - 4 && px <= x + (w || size * text.length) + 4 && py >= top - 3 && py <= bottom) {
                    // 同一行有多条时取最靠上的那条
                    if (!hit || top < hit.top) hit = { it, top, bottom, size, w: w || 0, text, x, font };
                }
            }
            return hit;
        }

        onMove(e) {
            if (!this.enabled() || !this.items.length) {
                this.hide();
                return;
            }
            // 指针已在 +1 按钮上：保持定格与浮条
            if (this.bar && this.bar.contains(e.target)) {
                this.cancelHide();
                return;
            }
            const cv = this.canvas();
            if (!cv) {
                this.hide();
                return;
            }
            const rect = cv.getBoundingClientRect();
            if (!rect.width || !rect.height) {
                this.hide();
                return;
            }
            if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
                this.scheduleHide();
                return;
            }
            const group = this.pickGroup();
            if (!group) {
                this.scheduleHide();
                return;
            }
            const cw = group[0][4] || cv.width || rect.width;
            const chh = group[0][5] || cv.height || rect.height;
            const sx = cw / rect.width;
            const sy = chh / rect.height;
            const hit = this.pick((e.clientX - rect.left) * sx, (e.clientY - rect.top) * sy);
            if (!hit) {
                this.scheduleHide();
                return;
            }
            this.cancelHide();
            // 换了一条就重新定位；同一条保持原位，按钮不跟着飘
            const changed = !this.hover || this.hover.hit.text !== hit.text;
            this.hover = { hit, rect, sx, sy };
            // 让 worker 把这条钉在原地
            if (changed || this.pinned !== hit.text) {
                this.pin(hit.text, hit.x, hit.top, hit.font);
                this.pinned = hit.text;
            }
            this.showBar(changed);
        }

        /** 离开弹幕后留 400ms 缓冲，方便鼠标移到 +1 按钮 */
        scheduleHide() {
            if (this.hideTimer) return;
            this.hideTimer = setTimeout(() => {
                this.hideTimer = 0;
                this.hide();
            }, 400);
        }
        cancelHide() {
            if (!this.hideTimer) return;
            clearTimeout(this.hideTimer);
            this.hideTimer = 0;
        }

        ensureBar() {
            if (this.bar) return this.bar;
            // 只放 +1，不抄原文：canvas 上的弹幕无法单独隐藏，抄一份会像多了一条
            const bar = document.createElement('div');
            bar.id = 'dlo-screen-plus1';
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'dlo-sp-btn';
            btn.textContent = '+1';
            btn.title = '我也发一条';
            btn.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const t = this.hover && this.hover.hit.text;
                this.hide();
                if (t) sendDanmaku(t);
            });
            bar.appendChild(btn);
            (document.body || document.documentElement).appendChild(bar);
            this.bar = bar;
            return bar;
        }

        showBar(reposition) {
            if (!this.enabled() || !this.hover) return;
            const bar = this.ensureBar();
            bar.style.display = 'flex';
            // 弹幕已定格，按钮钉在出现位置不动，便于点击
            if (reposition !== false) this.placeBar();
        }

        /** 按钮贴在原弹幕右侧，纵向对齐 */
        placeBar() {
            if (!this.bar || !this.hover) return;
            const { hit, rect, sx, sy } = this.hover;
            const left = rect.left + hit.x / sx;
            const top = rect.top + hit.top / sy;
            const size = hit.size / sy;
            const w = barWidth(this.bar);
            let x = left + (hit.w / sx) + 6;
            if (x + w > window.innerWidth - 8) x = left - w - 6;
            if (x < 8) x = Math.min(left + 6, window.innerWidth - w - 8);
            let y = top + size / 2 - 12;
            if (y < 8) y = 8;
            if (y > window.innerHeight - 32) y = window.innerHeight - 32;
            this.bar.style.left = `${Math.round(x)}px`;
            this.bar.style.top = `${Math.round(y)}px`;
        }

        hide() {
            this.cancelHide();
            this.hover = null;
            if (this.bar) this.bar.style.display = 'none';
            if (this.pinned) {
                this.unpin();
                this.pinned = '';
            }
        }
    }

    function barWidth(bar) {
        return bar?.offsetWidth || 120;
    }

    // ---------- 功能：进房间时停掉首页大直播间的流 + 清理房间 URL 参数 ----------
    /**
     * 首页大卡片直播间会自动起播：进房后点站方暂停按钮停掉（已暂停时别点，
     * 会把流重新拉起），再用 video.pause() 兜底。
     */
    function stopHomepageLive() {
        const big = queryOne('.LivePlayer_LiveBigCardPlayer');
        if (!big) return false;
        const video = big.querySelector('video');
        if (video && !video.paused) {
            const btn = big.querySelector('.douyin-player-icon.douyin-player-play');
            if (btn) {
                try {
                    btn.click();
                } catch (e) {
                }
            }
        }
        try {
            const v = big.querySelector('video');
            if (v && !v.paused) v.pause();
        } catch (e) {
        }
        return true;
    }

    /** 是不是指向直播间的链接 */
    function isRoomLink(a) {
        if (!a || a.tagName !== 'A') return false;
        const href = a.getAttribute('href') || '';
        if (!href) return false;
        try {
            const u = new URL(href, location.href);
            if (u.hostname !== 'live.douyin.com') return false;
            return /^\/\d+/.test(u.pathname);
        } catch (e) {
            return /live\.douyin\.com\/\d+/.test(href);
        }
    }

    /** 只留 /<房间号>：?query 与 #hash 都去掉；replaceState 不刷新、不加历史 */
    function cleanRoomUrl() {
        if (!isRoom() || !(location.search || location.hash)) return false;
        try {
            history.replaceState(history.state, '', location.pathname);
            return true;
        } catch (e) {
            return false;
        }
    }

    /** 房间链接改成纯 pathname，点开/右键/中键开出的新标签从第一帧就干净 */
    function stripRoomLink(a) {
        if (!isRoomLink(a)) return;
        const href = a.getAttribute('href') || '';
        let u;
        try {
            u = new URL(href, location.href);
        } catch (e) {
            return;
        }
        if (!u.search && !u.hash) return;
        a.setAttribute('href', u.pathname);
    }

    /**
     * URL 参数（enter_from / share_token / u_code / did 等）属于来源与设备追踪，进房前就清：
     * document-start 当场清、链接 href 提前改、window.open 兜住新标签；load 后再兜底几次。
     */
    function installUrlCleaner() {
        const origReplace = history.replaceState.bind(history);
        const clean = () => {
            if (!isRoom() || !(location.search || location.hash)) return;
            try {
                origReplace(history.state, '', location.pathname);
            } catch (e) {
            }
        };

        clean();

        // 站点自己 pushState/replaceState 写回参数时立即清
        for (const k of ['pushState', 'replaceState']) {
            const orig = history[k];
            if (typeof orig !== 'function') continue;
            try {
                history[k] = function () {
                    const r = orig.apply(this, arguments);
                    clean();
                    return r;
                };
            } catch (e) {
            }
        }

        const fromEvent = (e) => {
            const t = e.target;
            if (!t || typeof t.closest !== 'function') return;
            stripRoomLink(t.closest('a[href]'));
        };
        // pointerdown/contextmenu 早于默认动作，中键与右键「在新标签页打开」也覆盖
        for (const type of ['pointerdown', 'mousedown', 'contextmenu', 'click', 'auxclick']) {
            document.addEventListener(type, fromEvent, { capture: true, passive: true });
        }

        // 动态插入的卡片：只扫新增节点，避免整页轮询
        try {
            new MutationObserver((records) => {
                for (const r of records) {
                    for (const node of r.addedNodes) {
                        if (node.nodeType !== 1) continue;
                        if (node.tagName === 'A') stripRoomLink(node);
                        if (node.firstElementChild) node.querySelectorAll('a[href*="?"]').forEach(stripRoomLink);
                    }
                }
            }).observe(document.documentElement || document, { childList: true, subtree: true });
        } catch (e) {
        }

        // 脚本里 window.open(房间 URL) 的也摘掉参数；站点会反复重写 window.open，故用访问器兜住后续赋值
        const stripOpenArg = (fn) => {
            if (typeof fn !== 'function' || fn.__dloPatched) return fn;
            const patched = function (url, ...rest) {
                try {
                    const u = new URL(String(url), location.href);
                    if (u.hostname === 'live.douyin.com' && /^\/\d+/.test(u.pathname)) url = u.pathname;
                } catch (e) {
                }
                return fn.apply(this, [url, ...rest]);
            };
            patched.__dloPatched = true;
            return patched;
        };
        const patchOpen = () => {
            try {
                const W = pageWindow();
                let impl = stripOpenArg(W.open);
                if (typeof impl !== 'function') return;
                Object.defineProperty(W, 'open', {
                    configurable: true,
                    get: () => impl,
                    set: (fn) => {
                        impl = stripOpenArg(fn);
                    },
                });
            } catch (e) {
            }
        };
        patchOpen();
        for (const ms of [300, 1200, 3000, 6000]) setTimeout(patchOpen, ms);

        // 兜底：load 后站点可能再用 location 写入参数
        const backstop = () => {
            clean();
            patchOpen();
            let n = 0;
            const t = setInterval(() => {
                clean();
                if (++n >= 8) clearInterval(t);
            }, 800);
            setTimeout(patchOpen, 1500);
        };
        if (document.readyState === 'complete') backstop();
        else window.addEventListener('load', backstop, { once: true });
    }

    // ---------- 展馆集星浮层 ----------
    // 站点的礼物引导浮层（展馆 / 粉丝团任务 / 心愿单）共用一个按天标记：
    // localStorage.GiftGuideDateMark[类型] === 当天 就当天不再弹，点 × 关闭写的是同一个值。
    const GIFT_GUIDE_MARK_KEY = 'GiftGuideDateMark';
    const GIFT_GUIDE_EXHIBITION = 'GIFT_EXHIBITION';
    const GIFT_GUIDE_TITLE = '点亮展馆帮主播集星';

    /** 站点自己的日期格式：getMonth() 0 基且不补零，2026-10-25 是 "2026-9-25" */
    function giftGuideToday() {
        const d = new Date();
        return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    }

    /**
     * 预写「今天已关过」：组件首帧就判定为已关闭，浮层根本不渲染。
     * 必须赶在 React 渲染前写入 —— 该判定是 useMemo(deps 只有关闭状态)，写晚了不会重算。
     */
    function markGiftGuideClosed() {
        try {
            const W = pageWindow();
            const raw = W.localStorage.getItem(GIFT_GUIDE_MARK_KEY);
            const mark = raw ? JSON.parse(raw) : {};
            if (!mark || typeof mark !== 'object') return;
            const today = giftGuideToday();
            if (mark[GIFT_GUIDE_EXHIBITION] === today) return;
            mark[GIFT_GUIDE_EXHIBITION] = today;
            W.localStorage.setItem(GIFT_GUIDE_MARK_KEY, JSON.stringify(mark));
        } catch (e) {
        }
    }

    /** 已压住的浮层：元素 -> 自身 style 观察器（定位时站点会重写 style，得跟着再压一次） */
    const giftGuideHidden = new Map();
    let giftGuideObserver = null;

    /** 兜底：标记失效（站点改键名或日期格式）时，浮层一出现就藏起来；按标题文案找，不依赖哈希类名 */
    function watchGiftGuidePopup() {
        if (giftGuideObserver) return;
        const hide = (tip) => {
            if (tip.style) tip.style.setProperty('display', 'none', 'important');
            tip.setAttribute('hidden', '');
        };
        const suppress = (tip) => {
            if (!tip || giftGuideHidden.has(tip)) return;
            hide(tip);
            const obs = new MutationObserver(() => {
                if (tip.isConnected) hide(tip);
            });
            obs.observe(tip, { attributes: true, attributeFilter: ['style', 'class'] });
            giftGuideHidden.set(tip, obs);
        };
        const scan = (node) => {
            if (!node || node.nodeType !== 1) return;
            const tip = node.closest?.('.dylvue-tooltip') || node.querySelector?.('.dylvue-tooltip');
            if (!tip || giftGuideHidden.has(tip)) return;
            if ((tip.textContent || '').indexOf(GIFT_GUIDE_TITLE) === -1) return;
            suppress(tip);
        };
        giftGuideObserver = new MutationObserver((records) => {
            for (const r of records) {
                for (const node of r.addedNodes) scan(node);
            }
        });
        try {
            giftGuideObserver.observe(document.documentElement || document, { childList: true, subtree: true });
        } catch (e) {
            giftGuideObserver = null;
        }
    }

    /** 开关关掉时把还压着的浮层放出来；已写入的当天标记等同用户自己关过一次，不撤回 */
    function restoreGiftGuidePopups() {
        if (giftGuideObserver) {
            giftGuideObserver.disconnect();
            giftGuideObserver = null;
        }
        for (const [tip, obs] of giftGuideHidden) {
            try {
                obs.disconnect();
                tip.style.removeProperty('display');
                tip.removeAttribute('hidden');
            } catch (e) {
            }
        }
        giftGuideHidden.clear();
    }

    // ---------- 长时间无操作暂停 ----------
    // 站点 PausePop 组件的 eb()：cookie.LivePausePop.closeNum >= 2 时返回 false，
    // 监听 effect 就直接跳过排暂停定时器 —— 既不弹窗也不暂停。
    // 这正是站点「今天已关过 2 次就不再烦你」的官方分支，写它的 cookie 即可，
    // 不用改 DOM、不用模拟点击、也不用拦 visibilitychange。
    const IDLE_PAUSE_COOKIE = 'LivePausePop';
    const IDLE_PAUSE_CLOSE_LIMIT = 2;
    const IDLE_PAUSE_MAX_AGE = 3153600000;

    /** 原始 cookie 值（未解码），备份与还原用 */
    function idlePauseRaw() {
        const m = document.cookie.match(new RegExp('(?:^|;\\s*)' + IDLE_PAUSE_COOKIE + '=([^;]*)'));
        return m ? m[1] : '';
    }

    /** 站点 el()：cookie 是双重编码，解两层才是对象 */
    function readIdlePauseState() {
        const raw = idlePauseRaw();
        if (!raw) return {};
        try {
            let v = JSON.parse(decodeURIComponent(raw));
            if (typeof v === 'string') v = JSON.parse(decodeURIComponent(v));
            return v && typeof v === 'object' ? v : {};
        } catch (e) {
            return {};
        }
    }

    /** 站点 et() + setItem：JSON 两遍、encodeURIComponent 两遍，格式错就读不出来 */
    function writeIdlePauseState(state) {
        try {
            const payload = encodeURIComponent(JSON.stringify(state));
            document.cookie =
                IDLE_PAUSE_COOKIE +
                '=' +
                encodeURIComponent(JSON.stringify(payload)) +
                '; path=/; domain=.douyin.com; max-age=' +
                IDLE_PAUSE_MAX_AGE;
        } catch (e) {
        }
    }

    function writeIdlePauseRaw(raw) {
        try {
            document.cookie = raw
                ? IDLE_PAUSE_COOKIE + '=' + raw + '; path=/; domain=.douyin.com; max-age=' + IDLE_PAUSE_MAX_AGE
                : IDLE_PAUSE_COOKIE + '=; path=/; domain=.douyin.com; max-age=0';
        } catch (e) {
        }
    }

    /** 必须在 PausePop 首次读取前写；其余字段（todayCount / todayShowRoom / lastTimer）原样保留 */
    function suppressIdlePause() {
        const state = readIdlePauseState();
        if (state.closeNum >= IDLE_PAUSE_CLOSE_LIMIT) return;
        const d = loadStore();
        if (typeof d.idlePauseBackup !== 'string') saveStore({ idlePauseBackup: idlePauseRaw() });
        writeIdlePauseState(Object.assign({}, state, { closeNum: IDLE_PAUSE_CLOSE_LIMIT }));
    }

    /** 关掉开关时写回站点原值（原来没有 cookie 就删掉） */
    function restoreIdlePause() {
        const d = loadStore();
        if (typeof d.idlePauseBackup !== 'string') return;
        writeIdlePauseRaw(d.idlePauseBackup);
        saveStore({ idlePauseBackup: null });
    }

    // ---------- 看直播领积分 ----------
    // 站点「看直播领积分」面板是 Lynx 组件，文案和接口都不在网页 JS 里，只在这两个请求上：
    //   GET /webcast/quiz/box/enter?room_id=<房间>&box_id=-1   查箱子
    //   GET /webcast/quiz/box/click?room_id=<房间>&box_id=<N>  领取，返回最新箱子
    // 箱子 status：0 未开启 / 1 倒计时中 / 2 可领取 / 3 已领取。
    // 只领 status===2 的，不碰 DOM、不模拟点击。
    // 进房 1 分钟后查第一次，之后按箱子自己的倒计时定时领（加 10-30 秒随机抖动），全部领完就停。
    const POINT_API = '/webcast/quiz/box/';
    const POINT_BOX_COUNTING = 1;
    const POINT_BOX_READY = 2;
    const POINT_BOX_CLAIMED = 3;
    const POINT_ENTER_DELAY = 60 * 1000;    // 进房多久后开始查
    const POINT_RETRY_GAP = 60 * 1000;      // 有箱子可领却没领成时的重试间隔
    const POINT_IDLE_GAP = 5 * 60 * 1000;   // 只剩未开启的箱子时的慢查间隔
    const POINT_CLAIM_GAP = 900;            // 连续领取之间
    const POINT_JITTER_MIN = 10 * 1000;     // 定时领取的随机抖动
    const POINT_JITTER_MAX = 30 * 1000;

    let pointBusy = false;
    let pointTimer = null;
    let pointRoom = '';
    let pointDone = '';

    function pointJitter() {
        return POINT_JITTER_MIN + Math.round(Math.random() * (POINT_JITTER_MAX - POINT_JITTER_MIN));
    }

    /** 同一时间只留一个定时器 */
    function schedulePointCheck(delayMs) {
        if (pointTimer) clearTimeout(pointTimer);
        pointTimer = setTimeout(() => {
            pointTimer = null;
            runPointClaim();
        }, delayMs);
    }

    function stopPointClaim() {
        if (pointTimer) clearTimeout(pointTimer);
        pointTimer = null;
        pointRoom = '';
    }

    /** 进房后挂首查；换房间重新计时，离开房间或已领完就不再挂任何任务 */
    function armPointClaim() {
        const roomId = pointRoomId();
        if (!roomId) {
            stopPointClaim();
            return;
        }
        if (pointDone === roomId) return;
        if (pointTimer && pointRoom === roomId) return;
        const since = Date.now() - (Number(loadStore().pointCheckedAt) || 0);
        pointRoom = roomId;
        schedulePointCheck((since < POINT_ENTER_DELAY ? POINT_ENTER_DELAY - since : POINT_ENTER_DELAY) + pointJitter());
    }

    function pointRoomId() {
        const m = /^\/(\d{5,})/.exec(location.pathname);
        return m ? m[1] : '';
    }

    /** 站点 Web 端这套接口不校验签名，带上公共参数即可，登录态走 cookie */
    function pointApi(name, params) {
        const q = new URLSearchParams(
            Object.assign(
                {
                    aid: '6383',
                    app_name: 'douyin_web',
                    live_id: '1',
                    device_platform: 'web',
                    language: 'zh-CN',
                    enter_from: 'link_share'
                },
                params
            )
        );
        return fetch(POINT_API + name + '?' + q.toString(), { credentials: 'include' })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null);
    }

    /** 领一轮：查状态 → 逐个领取 → 按箱子倒计时排下一次 */
    async function runPointClaim() {
        if (pointBusy) return;
        const roomId = pointRoomId();
        if (!roomId) return;
        pointBusy = true;
        saveStore({ pointCheckedAt: Date.now() });
        try {
            const res = await pointApi('enter', { room_id: roomId, box_id: '-1' });
            let boxes = res && res.status_code === 0 && res.data ? res.data.boxs : null;
            if (!Array.isArray(boxes)) {
                // 查失败就等一会儿再来，别把定时链断掉
                pointRoom = roomId;
                schedulePointCheck(POINT_RETRY_GAP + pointJitter());
                return;
            }
            let claims = 0;
            for (const box of boxes.filter((b) => b && b.status === POINT_BOX_READY)) {
                const r = await pointApi('click', { room_id: roomId, box_id: String(box.box_id) });
                if (!r || r.status_code !== 0) break;
                claims += 1;
                if (r.data && Array.isArray(r.data.boxs)) boxes = r.data.boxs;
                await new Promise((ok) => setTimeout(ok, POINT_CLAIM_GAP));
            }
            if (claims) log('point claimed', { roomId, claims });
            const pending = boxes.filter((b) => b && b.status !== POINT_BOX_CLAIMED);
            if (!pending.length) {
                // 全领完就彻底收掉，不留定时器在后台
                pointDone = roomId;
                stopPointClaim();
                return;
            }
            // 有箱子在倒计时就等它走完（抖一下，别整点上报）；没领成/没开的兜底慢查
            const counting = pending.filter((b) => b.status === POINT_BOX_COUNTING && b.countdown_time > 0);
            let wait = POINT_IDLE_GAP;
            if (counting.length) wait = Math.min(...counting.map((b) => b.countdown_time)) * 1000;
            else if (pending.some((b) => b.status === POINT_BOX_READY)) wait = POINT_RETRY_GAP;
            pointRoom = roomId;
            schedulePointCheck(wait + pointJitter());
        } finally {
            pointBusy = false;
        }
    }

    // ---------- styles ----------
    function injectStyles() {
        if (document.getElementById('dlo-styles')) return;
        const style = document.createElement('style');
        style.id = 'dlo-styles';
        style.textContent = `
/* 设置按钮挂在礼物栏末尾，对齐官方 slot-item：64x80、图标 40x40、文字 48x20；
   外边距与官方一致，顶边才对得齐。 */
#dlo-fab{
  position:static;z-index:2147483000;
  width:64px;height:80px;margin:0 0 8px 8px;flex:0 0 auto;
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  padding:5px 8px;border-radius:8px;background:rgba(242,242,244,.08);
  cursor:pointer;user-select:none;-webkit-user-select:none;
  transition:background .15s ease
}
#dlo-fab:hover{background:rgba(242,242,244,.16)}
#dlo-fab .dlo-slot-icon{
  width:40px;height:40px;flex:0 0 auto;
  /* 盒子 40x40 与官方同高同位，图缩到 28px 居中 */
  background-size:28px 28px;background-repeat:no-repeat;background-position:center
}
#dlo-fab .dlo-slot-btn{
  width:48px;height:20px;margin-top:2px;flex:0 0 auto;
  display:flex;align-items:center;justify-content:center;
  font-size:12px;line-height:13.8px;color:rgba(255,255,255,.75);border-radius:4px
}
/* 礼物栏右边被我的按钮挤了一点，给左侧礼物兜个下限，别让它们缩到变形 */
.gitBarOptimizeEnabled [class*="gift_item_"]{min-width:76px !important}

#dlo-settings-backdrop{position:fixed;inset:0;z-index:2147483645;background:transparent}
/* 底色跟随官方变量；文字用面板自建实色（官方 --color-text-1 含 75% 透明，小字发虚），
   深浅两套按 html[dark] 切换。 */
#dlo-settings-panel{
  --dlo-fg:#161823;                 /* 正文 / 标题 / 下拉框 / 按钮文字 */
  --dlo-fg-muted:rgba(22,24,35,.62);/* 版本号、页脚这类次要信息 */
  position:fixed;z-index:2147483646;width:290px;box-sizing:border-box;
  background:var(--color-bg-base-b1,#fff);
  color:var(--dlo-fg);
  border:1px solid var(--color-tertiary-active,rgba(37,38,50,.08));
  border-radius:8px;
  box-shadow:0 8px 28px var(--color-shadow2,rgba(0,0,0,.1));
  padding:12px 14px 14px;
  /* 字体必须显式声明：简写里混用 inherit 会被整条丢弃，退回宿主页字号 */
  font-family:-apple-system,BlinkMacSystemFont,"Microsoft YaHei","Segoe UI","PingFang SC","Hiragino Sans GB","Helvetica Neue",Helvetica,Arial,sans-serif;
  font-size:12px;
  line-height:1.5;
  pointer-events:auto!important
}
/* 官方深色主题会给 html 加 dark="true" */
html[dark] #dlo-settings-panel{
  --dlo-fg:rgba(255,255,255,.92);
  --dlo-fg-muted:rgba(255,255,255,.66)
}
#dlo-settings-panel *{pointer-events:auto!important}
#dlo-settings-panel .dlo-head{display:flex;align-items:flex-start;gap:8px;margin:0 0 10px}
#dlo-settings-panel h3{flex:1;min-width:0;margin:0;font-size:12px;font-weight:600;color:var(--dlo-fg)}
#dlo-settings-panel .dlo-head-right{display:flex;align-items:center;gap:2px;flex:0 0 auto}
/* 版本号不用 --color-text-t5（浅色下是纯白，白底看不见），用面板次级实色 */
#dlo-settings-panel .ver{font-size:10px;font-weight:500;color:var(--dlo-fg-muted);white-space:nowrap}
#dlo-settings-panel #dlo-theme{
  flex:0 0 auto;width:22px;height:22px;padding:0;border:0;background:none!important;border-radius:4px;
  color:var(--dlo-fg);cursor:pointer;line-height:0;transition:color .15s,background .15s
}
#dlo-settings-panel #dlo-theme:hover{background:var(--color-secondary-hover,rgba(228,228,230,1))}
#dlo-settings-panel #dlo-theme svg[data-mode]{display:none}
#dlo-settings-panel #dlo-theme svg[data-active="1"]{display:block}
#dlo-settings-panel label.row{display:flex;align-items:center;gap:8px;margin:8px 0;cursor:pointer;font-weight:500}
#dlo-settings-panel select{
  width:100%;box-sizing:border-box;margin-top:4px;padding:6px 8px;
  border-radius:4px;border:1px solid var(--color-tertiary-active,rgba(37,38,50,.08));
  background:var(--color-bg-1,rgba(242,242,244,1));color:var(--dlo-fg);
  font-family:inherit;font-size:12px;font-weight:500
}
#dlo-settings-panel .field{margin-bottom:8px}
/* 标签与正文同字号、同颜色 */
#dlo-settings-panel .field-label{color:var(--dlo-fg);font-size:12px;font-weight:500}
#dlo-settings-panel .actions{display:flex;gap:8px;margin-top:12px}
#dlo-settings-panel button{flex:1;padding:7px 0;border:none;border-radius:4px;cursor:pointer;font-family:inherit;font-size:12px}
#dlo-settings-panel .btn-primary{background:var(--color-primary-default,rgba(255,44,85,1));color:#fff;font-weight:600}
#dlo-settings-panel .btn-ghost{background:var(--color-secondary-hover,rgba(228,228,230,1));color:var(--dlo-fg);font-weight:500}
#dlo-settings-panel .credits{margin:10px 0 -6px;padding-top:8px;border-top:1px solid var(--color-tertiary-active,rgba(37,38,50,.08));color:var(--dlo-fg-muted);font-size:12px;text-align:center}
#dlo-settings-panel .credits .ver{margin-bottom:3px}
#dlo-settings-panel .credits a{color:var(--color-primary-default,rgba(255,44,85,1));text-decoration:underline}

#dlo-screen-plus1{
  position:fixed;z-index:2147483001;display:none;align-items:center;
  pointer-events:auto!important
}
#dlo-screen-plus1 .dlo-sp-btn{
  min-width:38px;height:24px;padding:0 10px;border:none;border-radius:12px;
  background:linear-gradient(135deg,#FE2C55,#FF5C7A);color:#fff;font-size:12px;font-weight:700;
  line-height:24px;cursor:pointer;box-shadow:0 1px 6px rgba(0,0,0,.45);white-space:nowrap
}
#dlo-screen-plus1 .dlo-sp-btn:hover{filter:brightness(1.08)}
`;
        (document.head || document.documentElement).appendChild(style);
    }

    /** 设置按钮图标取元数据里的 @icon */
    function fabIconUrl() {
        return meta('icon') || '';
    }

    // ---------- 设置面板 ----------
    class SettingsUI {
        constructor(settings, onApply, onThemeChange) {
            this.settings = settings;
            this.onApply = onApply;
            this.onThemeChange = onThemeChange;
            this.panel = null;
            this.backdrop = null;
            this.themeMq = null;
            this.themeMqHandler = null;
        }

        /** 设置入口只挂在直播间礼物栏末尾；首页没有礼物栏，不挂 */
        mountFab() {
            const root = queryOne('.gitBarOptimizeEnabled');
            if (!root) {
                document.getElementById('dlo-fab')?.remove();
                return false;
            }
            const btn = this.ensureFab();
            // 礼物栏外层容器：官方动态按钮都排在这里
            const outer = root.parentElement && root.parentElement.contains(root) ? root.parentElement : root;
            this.setFabIcon(btn);
            // 已经是最后一个就不用动，避免反复 append 触发观察器死循环
            if (btn.parentElement !== outer || btn.nextElementSibling) outer.appendChild(btn);
            return true;
        }

        ensureFab() {
            let btn = document.getElementById('dlo-fab');
            if (btn) return btn;
            btn = document.createElement('div');
            btn.id = 'dlo-fab';
            btn.className = 'dlo-slot';
            btn.title = '抖音直播优化器 设置（全站生效）';
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.toggle(btn);
            });
            (document.body || document.documentElement).appendChild(btn);
            this.setFabIcon(btn);
            return btn;
        }

        /** 图标取 @icon，排版按官方 slot-item */
        setFabIcon(btn) {
            const url = fabIconUrl();
            if (!url) return;
            const want = 'slot|' + url;
            if (btn.dataset.dloIcon === want) return;
            btn.dataset.dloIcon = want;
            const esc = escapeHtml(url);
            btn.innerHTML =
                '<div class="dlo-slot-icon" style="background-image:url(' + esc + ')"></div>' +
                '<div class="dlo-slot-btn"><div>设置</div></div>';
        }

        /** 官方会动态往礼物栏加按钮，盯 DOM 重挂，保证自己始终排最后 */
        watchFab() {
            if (this.fabObserver) return;
            this.fabObserver = new MutationObserver(() => {
                if (this.fabTimer) return;
                this.fabTimer = setTimeout(() => {
                    this.fabTimer = 0;
                    this.mountFab();
                }, 100);
            });
            this.fabObserver.observe(document.documentElement, { childList: true, subtree: true });
        }

        close() {
            this.panel?.remove();
            this.backdrop?.remove();
            this.panel = null;
            this.backdrop = null;
        }

        toggle(anchor) {
            if (this.panel) this.close();
            else this.open(anchor);
        }

        open(anchor) {
            this.close();
            const backdrop = document.createElement('div');
            backdrop.id = 'dlo-settings-backdrop';
            backdrop.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.close();
            });
            document.body.appendChild(backdrop);
            this.backdrop = backdrop;

            const panel = document.createElement('div');
            panel.id = 'dlo-settings-panel';
            panel.innerHTML = this.formHtml();
            ['mousedown', 'mouseup', 'click', 'contextmenu', 'wheel'].forEach((type) => {
                panel.addEventListener(type, (e) => e.stopPropagation());
            });
            document.body.appendChild(panel);
            this.panel = panel;

            const rect = anchor?.getBoundingClientRect?.() || { left: window.innerWidth - 60, bottom: window.innerHeight - 60 };
            const w = 290;
            const h = panel.offsetHeight || 300;
            const left = Math.min(Math.max(8, rect.left - w + 20), window.innerWidth - w - 8);
            let top = rect.top - h - 12;
            if (!(top >= 8)) top = Math.min((rect.bottom || 100) + 12, window.innerHeight - h - 8);
            panel.style.left = `${left}px`;
            panel.style.top = `${top}px`;

            this.bind(panel);
        }

        formHtml() {
            const cur = this.settings.targetQuality || QUALITY_AUTO;
            const opts = [QUALITY_AUTO, ...QUALITY_RANKS]
                .map((q) => {
                    const label = q === QUALITY_AUTO ? '最高画质（默认）' : q;
                    return `<option value="${escapeHtml(q)}"${q === cur ? ' selected' : ''}>${escapeHtml(label)}</option>`;
                })
                .join('');
            const mode = THEME_MODES.includes(this.settings.themeMode) ? this.settings.themeMode : 'auto';
            const icons = THEME_MODES.map((m) => {
                const body = THEME_ICON[m].replace(/^<svg[^>]*>|<\/svg>$/g, '');
                return `<svg data-mode="${m}" data-active="${m === mode ? '1' : '0'}" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">${body}</svg>`;
            }).join('');
            return `
                <div class="dlo-head">
                    <h3>抖音直播优化器</h3>
                    <div class="dlo-head-right">
                        <button type="button" id="dlo-theme" title="配色：${THEME_LABEL[mode]}（点击切换）">${icons}</button>
                    </div>
                </div>
                <div class="field">
                    <div class="field-label">清晰度（进房自动切，全站生效）</div>
                    <select id="dlo-quality-select">${opts}</select>
                </div>
                <label class="row"><input type="checkbox" id="dlo-mute" ${this.settings.muteOnHome ? 'checked' : ''}/> 首页默认静音</label>
                <label class="row"><input type="checkbox" id="dlo-plus1" ${this.settings.enableScreenPlusOne ? 'checked' : ''}/> 画面弹幕 +1</label>
                <label class="row"><input type="checkbox" id="dlo-history" ${this.settings.enableDanmakuHistory ? 'checked' : ''}/> 弹幕输入框上下键历史</label>
                <label class="row"><input type="checkbox" id="dlo-nogiftguide" ${this.settings.enableNoGiftGuide !== false ? 'checked' : ''}/> 屏蔽「点亮展馆」浮层</label>
                <label class="row"><input type="checkbox" id="dlo-noidlepause" ${this.settings.enableNoIdlePause !== false ? 'checked' : ''}/> 禁用无操作暂停弹窗</label>
                <label class="row"><input type="checkbox" id="dlo-pointclaim" ${this.settings.enablePointClaim === true ? 'checked' : ''}/> 自动领取看播积分</label>
                <div class="actions">
                    <button type="button" class="btn-ghost" id="dlo-close">关闭</button>
                    <button type="button" class="btn-primary" id="dlo-save">保存并应用</button>
                </div>
                <div class="credits">
                    <div class="ver">v${escapeHtml(meta('version'))}</div>
                    <div>Powered by <a href="https://mks155.github.io" target="_blank" rel="noopener noreferrer">mks155</a></div>
                </div>
            `;
        }

        /** 官方改了主题、配置同步过来时刷新面板图标 */
        refreshThemeIcon(mode) {
            if (!this.panel) return;
            this.settings.themeMode = mode;
            this.panel.querySelectorAll('#dlo-theme svg[data-mode]').forEach((svg) => {
                svg.dataset.active = svg.dataset.mode === mode ? '1' : '0';
            });
            const btn = this.panel.querySelector('#dlo-theme');
            if (btn) btn.title = `配色：${THEME_LABEL[mode]}（点击切换）`;
        }

        /** 切主题：只把档位交给官方（写 cookie + 刷新 DOM 属性），面板随官方变量变化 */
        cycleTheme(panel) {
            const cur = THEME_MODES.includes(this.settings.themeMode) ? this.settings.themeMode : 'auto';
            const next = THEME_MODES[(THEME_MODES.indexOf(cur) + 1) % THEME_MODES.length];
            this.settings.themeMode = next;
            saveSettings(this.settings);
            panel.querySelectorAll('#dlo-theme svg[data-mode]').forEach((svg) => {
                svg.dataset.active = svg.dataset.mode === next ? '1' : '0';
            });
            const btn = panel.querySelector('#dlo-theme');
            if (btn) btn.title = `配色：${THEME_LABEL[next]}（点击切换）`;
            this.onThemeChange?.(next);
            log('theme ->', next);
        }

        bind(panel) {
            panel.querySelector('#dlo-close')?.addEventListener('click', (e) => {
                e.stopPropagation();
                this.close();
            });
            panel.querySelector('#dlo-theme')?.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.cycleTheme(panel);
            });
            panel.querySelector('#dlo-save')?.addEventListener('click', (e) => {
                e.stopPropagation();
                this.settings = {
                    muteOnHome: !!panel.querySelector('#dlo-mute')?.checked,
                    targetQuality: panel.querySelector('#dlo-quality-select')?.value ?? QUALITY_AUTO,
                    enableScreenPlusOne: !!panel.querySelector('#dlo-plus1')?.checked,
                    enableDanmakuHistory: !!panel.querySelector('#dlo-history')?.checked,
                    enableNoGiftGuide: !!panel.querySelector('#dlo-nogiftguide')?.checked,
                    enableNoIdlePause: !!panel.querySelector('#dlo-noidlepause')?.checked,
                    enablePointClaim: !!panel.querySelector('#dlo-pointclaim')?.checked,
                    themeMode: THEME_MODES.includes(this.settings.themeMode) ? this.settings.themeMode : 'auto'
                };
                saveSettings(this.settings);
                this.onThemeChange?.(this.settings.themeMode);
                this.onApply(this.settings);
                this.close();
                log('settings saved', this.settings);
            });
        }
    }

    // ---------- bootstrap ----------
    // 主题尽早刷，否则会先闪官方默认配色；脚本配置为准，用户点官方控件才反同步
    const settings = loadSettings();
    const officialTheme = new OfficialTheme(settings);
    officialTheme.apply();
    officialTheme.startWatch();
    officialTheme.watchOfficialToggle();
    // 官方改了主题时通知设置面板刷新图标
    let onThemeSynced = null;
    officialTheme.onModeChanged = (mode) => onThemeSynced?.(mode);

    function main() {
        injectStyles();

        const quality = new QualityOptimizer(settings);
        const screenPlusOne = new ScreenDanmakuPlusOne(settings);
        const history = new DanmakuHistory(settings);
        const ui = new SettingsUI(
            settings,
            (next) => {
                quality.updateSettings(next);
                screenPlusOne.update(next);
                history.update(next);
                applyRoute(next);
            },
            (mode) => {
                // 配色只走官方那套
                officialTheme.settings.themeMode = mode;
                officialTheme.apply();
            }
        );
        onThemeSynced = (mode) => ui.refreshThemeIcon(mode);

        function applyRoute(s) {
            if (s.muteOnHome) startHomeMute();
            else stopMute();
            if (isRoom()) quality.run();
            if (s.enableNoGiftGuide !== false) {
                markGiftGuideClosed();
                watchGiftGuidePopup();
            } else {
                restoreGiftGuidePopups();
            }
            if (s.enableNoIdlePause !== false) suppressIdlePause();
            else restoreIdlePause();
            if (s.enablePointClaim === true) armPointClaim();
            else {
                pointDone = '';
                stopPointClaim();
            }
        }

        ui.mountFab();
        ui.watchFab();
        screenPlusOne.bind();
        history.bind();

        applyRoute(settings);
        // 画质面板起得慢，再补一次；用户手动切档会在 settle 检查里被尊重
        setTimeout(() => {
            if (isRoom()) quality.run();
        }, 6000);

        // SPA 路由：首页 <-> 直播间之间不刷新页面，靠 URL 变化把功能重新对一遍
        let href = location.href;
        const onNav = () => {
            log('route change ->', location.pathname);
            quality.done = false;
            quality.targetText = '';
            screenPlusOne.hide();
            // 同标签内跳进房间时，首页那个大直播间的流也得停
            if (isRoom()) {
                stopHomepageLive();
                cleanRoomUrl();
            }
            applyRoute(loadSettings());
        };
        window.addEventListener('popstate', onNav);
        setInterval(() => {
            if (location.href !== href) {
                href = location.href;
                onNav();
            }
        }, 2000);

        log('initialized', { version: meta('version'), settings, home: isHome(), room: isRoom() });
    }

    // worker 钩子必须赶在播放器建 worker 之前（load 之前），故在 document-start 执行
    installDanmakuWorkerHook();

    // 房间链接多为 target=_blank，首页标签不会触发路由变化，点击时就得停掉首页大卡片
    document.addEventListener(
        'click',
        (e) => {
            const a = e.target?.closest?.('a[href]');
            if (!isRoomLink(a)) return;
            stopHomepageLive();
        },
        { capture: true, passive: true }
    );

    // 房间 URL 上的参数去掉，只留 https://live.douyin.com/<房间号>
    installUrlCleaner();

    // 展馆集星浮层：标记要赶在组件首帧渲染前写，所以放在 document-start，不等 main()
    if (settings.enableNoGiftGuide !== false) {
        markGiftGuideClosed();
        watchGiftGuidePopup();
    }

    // 无操作暂停：PausePop 挂载时才读 cookie，document-start 写入即可生效
    if (settings.enableNoIdlePause !== false) suppressIdlePause();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(main, 300));
    } else {
        setTimeout(main, 300);
    }
})();
