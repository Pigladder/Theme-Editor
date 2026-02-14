<template>
  <div class="app" :class="themeStore.current">
    <!-- 自定义标题栏 -->
    <div class="titlebar" data-tauri-drag-region>
      <span class="title">主题编辑器</span>
      <div class="window-controls">
        <button @click="minimize">−</button>
        <button @click="maximize">□</button>
        <button @click="close">×</button>
      </div>
    </div>

    <!-- 工具栏 -->
    <div class="toolbar">
      <!-- 主题选择 -->
      <select v-model="themeStore.current" @change="themeStore.apply">
        <option value="dark">Dark</option>
        <option value="light">Light</option>
        <option value="purple">Purple Dream</option>
        <option value="light-red">亮红</option>
        <option value="dark-red">暗红</option>
        <option value="light-purple">亮紫</option>
        <option value="dark-purple">暗紫</option>
        <option value="high-contrast">高对比度</option>
        <option value="win7">Windows 7</option>
        <option value="newyear">🧧 新年主题</option>
        <option value="mint">🌿 薄荷清新</option>
        <option value="ocean">🌊 深海蓝</option>
        <option value="sunset">🌅 日落橙</option>
        <option value="sakura">🌸 樱花粉</option>
        <option value="cyberpunk">🤖 赛博朋克</option>
        <option value="coffee">☕ 咖啡时光</option>
        <option value="aurora">🌌 极光</option>
        <option value="forest">🌲 森林绿</option>
      </select>

      <!-- 字体大小控制 -->
      <div class="font-control">
        <span class="font-label">A</span>
        <input
          v-model.number="themeStore.fontSize"
          type="range"
          min="10"
          max="24"
          step="1"
          class="font-slider"
          @change="themeStore.apply"
        />
        <span class="font-value">{{ themeStore.fontSize }}px</span>
      </div>

      <!-- 文件操作 -->
      <button @click="openFile">打开</button>
      <button @click="saveFile">保存</button>
    </div>

    <!-- 编辑器区域 -->
    <div class="editor-container">
      <!-- 行号栏 -->
      <div ref="lineNumbersRef" class="line-numbers" :style="lineNumberStyle">
        <div
          v-for="num in lineCount"
          :key="num"
          class="line-number"
          :class="{ active: currentLine === num }"
        >
          {{ num }}
        </div>
      </div>

      <!-- 文本编辑区 -->
      <textarea
        ref="textareaRef"
        v-model="content"
        class="editor"
        :style="editorStyle"
        placeholder="在此输入文本..."
        spellcheck="false"
        @scroll="syncScroll"
        @keydown="handleKeydown"
        @click="updateCurrentLine"
        @keyup="updateCurrentLine"
      />
    </div>

    <!-- 状态栏 -->
    <div class="statusbar">
      <span>{{ content.length }} 字符 | {{ lineCount }} 行 | 第 {{ currentLine }} 行</span>
      <span>{{ themeStore.current }} 主题 | {{ themeStore.fontSize }}px</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useThemeStore } from './stores/theme'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { open, save } from '@tauri-apps/plugin-dialog'
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'

// ==================== 状态定义 ====================

const content = ref('')
const filePath = ref<string | null>(null)
const currentLine = ref(1)

const textareaRef = ref<HTMLTextAreaElement>()
const lineNumbersRef = ref<HTMLDivElement>()

const themeStore = useThemeStore()

// ==================== 计算属性 ====================

/** 编辑器样式（字体大小） */
const editorStyle = computed(() => ({
  fontSize: `${themeStore.fontSize}px`,
  lineHeight: '1.6',
}))

/** 行号栏样式 */
const lineNumberStyle = computed(() => ({
  fontSize: `${themeStore.fontSize}px`,
  lineHeight: '1.6',
}))

/** 行高计算 */
const lineHeight = computed(() => themeStore.fontSize * 1.6)

/** 总行数 */
const lineCount = computed(() => content.value.split('\n').length || 1)

// ==================== 方法 ====================

/** 同步行号滚动 */
const syncScroll = () => {
  if (textareaRef.value && lineNumbersRef.value) {
    lineNumbersRef.value.scrollTop = textareaRef.value.scrollTop
  }
}

/** 更新当前行号 */
const updateCurrentLine = () => {
  if (!textareaRef.value) return

  const cursorPosition = textareaRef.value.selectionStart
  const textBeforeCursor = content.value.substring(0, cursorPosition)
  currentLine.value = textBeforeCursor.split('\n').length
}

/** 键盘事件处理 */
const handleKeydown = (e: KeyboardEvent) => {
  // Tab 缩进
  if (e.key === 'Tab') {
    e.preventDefault()
    document.execCommand('insertText', false, '  ')
    updateCurrentLine()
    return
  }

  // Ctrl + +/- 调节字体
  if (e.ctrlKey) {
    if (e.key === '=' || e.key === '+') {
      e.preventDefault()
      if (themeStore.fontSize < 24) {
        themeStore.fontSize++
        themeStore.apply()
      }
      return
    }

    if (e.key === '-') {
      e.preventDefault()
      if (themeStore.fontSize > 10) {
        themeStore.fontSize--
        themeStore.apply()
      }
      return
    }

    // Ctrl + 0 重置字体
    if (e.key === '0') {
      e.preventDefault()
      themeStore.fontSize = 14
      themeStore.apply()
    }
  }
}

// ==================== 窗口控制 ====================

const minimize = () => getCurrentWindow().minimize()
const maximize = () => getCurrentWindow().toggleMaximize()
const close = () => getCurrentWindow().close()

// ==================== 文件操作 ====================

/** 打开文件 */
const openFile = async () => {
  try {
    const selected = await open({
      multiple: false,
      filters: [
        {
          name: 'Text Files',
          extensions: ['txt', 'md', 'json', 'js', 'ts', 'vue', 'html', 'css'],
        },
        { name: 'All Files', extensions: ['*'] },
      ],
    })

    if (selected && typeof selected === 'string') {
      filePath.value = selected
      content.value = await readTextFile(selected)
      currentLine.value = 1
      console.log('✅ 已打开:', selected)
    }
  } catch (err) {
    console.error('❌ 打开文件失败:', err)
  }
}

/** 保存文件 */
const saveFile = async () => {
  try {
    let path = filePath.value

    // 首次保存，弹出对话框
    if (!path) {
      path = await save({
        filters: [
          { name: 'Text Files', extensions: ['txt'] },
          { name: 'Markdown', extensions: ['md'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      })
    }

    if (path) {
      await writeTextFile(path, content.value)
      filePath.value = path
      console.log('💾 已保存:', path)
    }
  } catch (err) {
    console.error('❌ 保存文件失败:', err)
  }
}

// ==================== 生命周期 ====================

onMounted(() => {
  themeStore.load()
})
</script>

<style>
/* ==================== 基础变量（Dark 主题） ==================== */
.app {
  --bg: #1e1e1e;
  --surface: #252526;
  --text: #d4d4d4;
  --text-muted: #858585;
  --primary: #007acc;
  --border: #3e3e42;
  --accent: #264f78;
  --titlebar-bg: #3c3c3c;

  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  color: var(--text);
  font-family: 'Segoe UI', system-ui, sans-serif;
  overflow: hidden;
}

/* ==================== 主题定义 ==================== */

/* Light */
.app.light {
  --bg: #ffffff;
  --surface: #f5f5f5;
  --text: #333333;
  --text-muted: #999999;
  --primary: #2196f3;
  --border: #e0e0e0;
  --accent: #bbdefb;
  --titlebar-bg: #f0f0f0;
}

/* Purple */
.app.purple {
  --bg: #2d1b4e;
  --surface: #3d2b5e;
  --text: #e6e6fa;
  --text-muted: #b8b8d1;
  --primary: #9d4edd;
  --border: #5a4fcf;
  --accent: #7b2cbf;
  --titlebar-bg: #1a0f2e;
}

/* Light Red */
.app.light-red {
  --bg: #fff5f5;
  --surface: #ffe0e0;
  --text: #5c1a1a;
  --text-muted: #a05050;
  --primary: #e53e3e;
  --border: #feb2b2;
  --accent: #fc8181;
  --titlebar-bg: #fed7d7;
}

/* Dark Red */
.app.dark-red {
  --bg: #1a0505;
  --surface: #2d0a0a;
  --text: #fbb6b6;
  --text-muted: #9b2c2c;
  --primary: #c53030;
  --border: #5c1a1a;
  --accent: #742a2a;
  --titlebar-bg: #2d0a0a;
}

/* Light Purple */
.app.light-purple {
  --bg: #faf5ff;
  --surface: #f3e8ff;
  --text: #4a1a6b;
  --text-muted: #8b5cf6;
  --primary: #9333ea;
  --border: #d8b4fe;
  --accent: #c084fc;
  --titlebar-bg: #e9d5ff;
}

/* Dark Purple */
.app.dark-purple {
  --bg: #1a0a2e;
  --surface: #2d1b4e;
  --text: #e9d5ff;
  --text-muted: #7c3aed;
  --primary: #7c3aed;
  --border: #4c1d95;
  --accent: #5b21b6;
  --titlebar-bg: #1a0a2e;
}

/* High Contrast */
.app.high-contrast {
  --bg: #000000;
  --surface: #000000;
  --text: #ffffff;
  --text-muted: #ffff00;
  --primary: #00ffff;
  --border: #ffffff;
  --accent: #ff00ff;
  --titlebar-bg: #000000;
}

/* Windows 7 */
.app.win7 {
  --bg: #f0f0f0;
  --surface: #e5e5e5;
  --text: #000000;
  --text-muted: #666666;
  --primary: #0078d7;
  --border: #b4b4b4;
  --accent: #b4d7f0;
  --titlebar-bg: linear-gradient(to bottom, #0078d7, #005a9e);
}

/* New Year */
.app.newyear {
  --bg: #8b0000;
  --surface: #b22222;
  --text: #ffd700;
  --text-muted: #ffa500;
  --primary: #ff4500;
  --border: #ffd700;
  --accent: #ff6347;
  --titlebar-bg: linear-gradient(to bottom, #dc143c, #8b0000);
}

/* Mint */
.app.mint {
  --bg: #f0fdf4;
  --surface: #dcfce7;
  --text: #14532d;
  --text-muted: #16a34a;
  --primary: #10b981;
  --border: #86efac;
  --accent: #34d399;
  --titlebar-bg: linear-gradient(to bottom, #34d399, #059669);
}

/* Ocean */
.app.ocean {
  --bg: #0c1e2b;
  --surface: #122b3d;
  --text: #a5d8ff;
  --text-muted: #4a90b8;
  --primary: #0ea5e9;
  --border: #1e4a6b;
  --accent: #0284c7;
  --titlebar-bg: linear-gradient(to bottom, #0c4a6e, #082f49);
}

/* Sunset */
.app.sunset {
  --bg: #2d1b0e;
  --surface: #4a2c17;
  --text: #fed7aa;
  --text-muted: #fb923c;
  --primary: #f97316;
  --border: #c2410c;
  --accent: #ea580c;
  --titlebar-bg: linear-gradient(to bottom, #c2410c, #9a3412);
}

/* Sakura */
.app.sakura {
  --bg: #fdf2f8;
  --surface: #fce7f3;
  --text: #831843;
  --text-muted: #db2777;
  --primary: #ec4899;
  --border: #fbcfe8;
  --accent: #f472b6;
  --titlebar-bg: linear-gradient(to bottom, #f472b6, #db2777);
}

/* Cyberpunk */
.app.cyberpunk {
  --bg: #0a0a0a;
  --surface: #1a1a1a;
  --text: #00ff9f;
  --text-muted: #00b8ff;
  --primary: #ff00ff;
  --border: #ff00ff;
  --accent: #ffff00;
  --titlebar-bg: linear-gradient(to right, #ff00ff, #00ffff);
}

/* Coffee */
.app.coffee {
  --bg: #3e2723;
  --surface: #4e342e;
  --text: #d7ccc8;
  --text-muted: #a1887f;
  --primary: #8d6e63;
  --border: #5d4037;
  --accent: #6d4c41;
  --titlebar-bg: linear-gradient(to bottom, #5d4037, #3e2723);
}

/* Aurora */
.app.aurora {
  --bg: #0f172a;
  --surface: #1e293b;
  --text: #e2e8f0;
  --text-muted: #64748b;
  --primary: #38bdf8;
  --border: #334155;
  --accent: #818cf8;
  --titlebar-bg: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
}

/* Forest */
.app.forest {
  --bg: #052e16;
  --surface: #064e3b;
  --text: #d1fae5;
  --text-muted: #34d399;
  --primary: #10b981;
  --border: #065f46;
  --accent: #059669;
  --titlebar-bg: linear-gradient(to bottom, #065f46, #022c22);
}

/* ==================== 布局组件 ==================== */

/* 标题栏 */
.titlebar {
  height: 32px;
  background: var(--titlebar-bg);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  border-bottom: 1px solid var(--border);
  user-select: none;
}

[data-tauri-drag-region] {
  app-region: drag;
}

.title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
}

.window-controls {
  display: flex;
  gap: 8px;
  app-region: no-drag;
}

.window-controls button {
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--text);
  cursor: pointer;
  border-radius: 4px;
  font-size: 14px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.window-controls button:hover {
  background: var(--surface);
}

/* 工具栏 */
.toolbar {
  height: 40px;
  background: var(--surface);
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  border-bottom: 1px solid var(--border);
}

.toolbar select,
.toolbar button {
  background: var(--bg);
  color: var(--text);
  border: 1px solid var(--border);
  padding: 4px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}

.toolbar button:hover {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
}

/* 字体控制 */
.font-control {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  margin-right: 10px;
}

.font-label {
  font-size: 12px;
  color: var(--text-muted);
}

.font-value {
  font-size: 12px;
  color: var(--text);
  min-width: 35px;
}

.font-slider {
  width: 80px;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: var(--border);
  border-radius: 2px;
  outline: none;
}

.font-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  background: var(--primary);
  border-radius: 50%;
  cursor: pointer;
}

.font-slider::-moz-range-thumb {
  width: 14px;
  height: 14px;
  background: var(--primary);
  border-radius: 50%;
  cursor: pointer;
  border: none;
}

/* 编辑器容器 */
.editor-container {
  flex: 1;
  display: flex;
  overflow: hidden;
  position: relative;
}

/* 行号栏 */
.line-numbers {
  width: 50px;
  background: var(--surface);
  color: var(--text-muted);
  text-align: right;
  padding: 20px 10px;
  font-family: 'JetBrains Mono', 'Consolas', monospace;
  overflow: hidden;
  user-select: none;
  border-right: 1px solid var(--border);
}

.line-number {
  height: v-bind('lineHeight + "px"');
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.line-number.active {
  color: var(--primary);
  font-weight: bold;
}

/* 文本编辑区 */
.editor {
  flex: 1;
  background: transparent;
  color: var(--text);
  border: none;
  outline: none;
  padding: 20px;
  font-family: 'JetBrains Mono', 'Consolas', 'Courier New', monospace;
  resize: none;
  tab-size: 2;
  overflow: auto;
}

.editor::placeholder {
  color: var(--text-muted);
}

.editor::selection {
  background: var(--accent);
}

/* 状态栏 */
.statusbar {
  height: 24px;
  background: var(--primary);
  color: white;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  font-size: 12px;
}

/* 重置 */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}
</style>