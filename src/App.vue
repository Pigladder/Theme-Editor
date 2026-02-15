<template>
  <div class="app" :class="themeStore.current">
    <!-- 自定义标题栏 -->
    <div class="titlebar" data-tauri-drag-region>
      <span class="title">
        Theme Editor {{ isModified ? '●' : '' }}
      </span>
      <div class="window-controls">
        <button @click="minimize" app-region="no-drag">−</button>
        <button @click="maximize" app-region="no-drag">□</button>
        <button @click="close" app-region="no-drag">×</button>
      </div>
    </div>

    <!-- 工具栏 -->
    <div class="toolbar">
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

      <button @click="openFile">打开</button>
      <button @click="saveFile">保存</button>
    </div>

    <!-- 查找替换面板 -->
    <div v-if="showFindReplace" class="find-replace-panel">
      <div class="find-replace-header">
        <span>查找和替换</span>
        <button @click="closeFindReplace">✕</button>
      </div>

      <div class="find-replace-body">
        <div class="input-row">
          <input
            v-model="findText"
            type="text"
            placeholder="查找"
            class="find-input"
            @input="updateMatchCount"
            @keyup.enter="findNext"
          />
          <span class="match-info">{{ currentMatch }} / {{ matchCount }}</span>
        </div>

        <div class="input-row">
          <input
            v-model="replaceText"
            type="text"
            placeholder="替换为"
            class="replace-input"
            @keyup.enter="replaceCurrent"
          />
        </div>

        <div class="options-row">
          <label class="option">
            <input v-model="caseSensitive" type="checkbox" @change="updateMatchCount" />
            <span>区分大小写</span>
          </label>
          <label class="option">
            <input v-model="useRegex" type="checkbox" @change="updateMatchCount" />
            <span>正则表达式</span>
          </label>
        </div>

        <div class="buttons-row">
          <button @click="findPrevious">上一个</button>
          <button @click="findNext">下一个</button>
          <button @click="replaceCurrent">替换</button>
          <button @click="replaceAll">全部替换</button>
        </div>
      </div>
    </div>

    <!-- 编辑器区域 -->
    <div class="editor-container">
      <div v-if="isDragging" class="drag-overlay">
        <div class="drag-content">
          <span class="drag-icon">📂</span>
          <span class="drag-text">释放以打开文件</span>
        </div>
      </div>

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
import { ref, computed, onMounted, watch } from 'vue'
import { useThemeStore } from './stores/theme'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { open, save, ask } from '@tauri-apps/plugin-dialog'
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'
import { listen } from '@tauri-apps/api/event'

// ==================== 状态定义 ====================

const content = ref('')
const filePath = ref<string | null>(null)
const currentLine = ref(1)
const isModified = ref(false)
const lastSavedContent = ref('')
const isDragging = ref(false)

const textareaRef = ref<HTMLTextAreaElement>()
const lineNumbersRef = ref<HTMLDivElement>()

const themeStore = useThemeStore()

// ==================== 查找替换状态 ====================

const showFindReplace = ref(false)
const findText = ref('')
const replaceText = ref('')
const findIndex = ref(0)
const matchCount = ref(0)
const currentMatch = ref(0)
const caseSensitive = ref(false)
const useRegex = ref(false)

// ==================== 计算属性 ====================

const editorStyle = computed(() => ({
  fontSize: `${themeStore.fontSize}px`,
  lineHeight: '1.6',
}))

const lineNumberStyle = computed(() => ({
  fontSize: `${themeStore.fontSize}px`,
  lineHeight: '1.6',
}))

const lineHeightPx = computed(() => themeStore.fontSize * 1.6)

const lineCount = computed(() => content.value.split('\n').length || 1)

// ==================== 监听 ====================

watch(content, (newVal) => {
  isModified.value = newVal !== lastSavedContent.value
})

// ==================== 拖拽处理 ====================

const setupDragListeners = async () => {
  await listen('tauri://drag-enter', () => {
    console.log('拖拽进入')
    isDragging.value = true
  })

  await listen('tauri://drag-leave', () => {
    console.log('拖拽离开')
    isDragging.value = false
  })

  // Tauri v2 标准文件拖放事件
  await listen<{ paths: string[] }>('tauri://file-drop', async (event) => {
    console.log('文件拖放:', event.payload)
    isDragging.value = false

    const paths = event.payload.paths
    if (!paths || paths.length === 0) return

    const droppedPath = paths[0]

    const isTextFile = /\.(txt|md|json|js|ts|vue|html|css|xml|yaml|yml|rs|toml|py)$/i.test(droppedPath)
    if (!isTextFile) {
      console.log('❌ 不是文本文件:', droppedPath)
      return
    }

    try {
      if (isModified.value) {
        const response = await ask('有未保存的更改，是否保存？', {
          title: '保存确认',
          kind: 'info',
          okLabel: '保存',
          cancelLabel: '不保存'
        })

        if (response === true) {
          await saveFile()
          if (isModified.value) return
        }
      }

      const text = await readTextFile(droppedPath)
      content.value = text
      filePath.value = droppedPath
      lastSavedContent.value = text
      isModified.value = false
      currentLine.value = 1

      console.log('✅ 已打开:', droppedPath)
    } catch (err) {
      console.error('❌ 读取文件失败:', err)
    }
  })
}

// ==================== 编辑器方法 ====================

const syncScroll = () => {
  if (textareaRef.value && lineNumbersRef.value) {
    lineNumbersRef.value.scrollTop = textareaRef.value.scrollTop
  }
}

const updateCurrentLine = () => {
  if (!textareaRef.value) return

  const cursorPosition = textareaRef.value.selectionStart
  const textBeforeCursor = content.value.substring(0, cursorPosition)
  currentLine.value = textBeforeCursor.split('\n').length
}

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Tab') {
    e.preventDefault()
    document.execCommand('insertText', false, '  ')
    updateCurrentLine()
    return
  }

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

    if (e.key === '0') {
      e.preventDefault()
      themeStore.fontSize = 14
      themeStore.apply()
      return
    }
  }

  if (e.key === 'Escape' && showFindReplace.value) {
    e.preventDefault()
    closeFindReplace()
    return
  }

  if (e.ctrlKey && e.key === 'f') {
    e.preventDefault()
    openFindReplace()
    return
  }

  if (e.ctrlKey && e.key === 'h') {
    e.preventDefault()
    openFindReplace()
    return
  }
}

// ==================== 窗口控制 ====================

const minimize = () => getCurrentWindow().minimize()
const maximize = () => getCurrentWindow().toggleMaximize()

const close = async () => {
  if (isModified.value) {
    const response = await ask('有未保存的更改，是否保存？', {
      title: '保存确认',
      kind: 'info',
      okLabel: '保存',
      cancelLabel: '不保存'
    })

    if (response === true) {
      await saveFile()
      if (!isModified.value) {
        await getCurrentWindow().close()
      }
    } else if (response === false) {
      await getCurrentWindow().close()
    }
  } else {
    await getCurrentWindow().close()
  }
}

// ==================== 文件操作 ====================

const saveFile = async () => {
  try {
    let path = filePath.value

    if (!path) {
      path = await save({
        filters: [
          { name: 'Text Files', extensions: ['txt'] },
          { name: 'Markdown', extensions: ['md'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      })
    }

    if (path) {
      await writeTextFile(path, content.value)
      filePath.value = path
      lastSavedContent.value = content.value
      isModified.value = false
      console.log('💾 已保存:', path)
    }
  } catch (err) {
    console.error('❌ 保存文件失败:', err)
  }
}

const openFile = async () => {
  try {
    const selected = await open({
      multiple: false,
      filters: [
        { name: 'Text Files', extensions: ['txt', 'md', 'json', 'js', 'ts', 'vue', 'html', 'css', 'rs', 'toml', 'py'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })

    if (selected && typeof selected === 'string') {
      if (isModified.value) {
        const response = await ask('有未保存的更改，是否保存？', {
          title: '保存确认',
          kind: 'info',
          okLabel: '保存',
          cancelLabel: '不保存'
        })

        if (response === true) {
          await saveFile()
          if (isModified.value) return
        } else if (response === null) {
          return
        }
      }

      const text = await readTextFile(selected)
      content.value = text
      filePath.value = selected
      lastSavedContent.value = text
      isModified.value = false
      currentLine.value = 1
      console.log('✅ 已打开:', selected)
    }
  } catch (err) {
    console.error('❌ 打开文件失败:', err)
  }
}

// ==================== 查找替换方法 ====================

const openFindReplace = () => {
  showFindReplace.value = true
  findIndex.value = 0
  updateMatchCount()
  
  setTimeout(() => {
    const findInput = document.querySelector('.find-input') as HTMLInputElement
    findInput?.focus()
  }, 0)
}

const closeFindReplace = () => {
  showFindReplace.value = false
  findText.value = ''
  replaceText.value = ''
  findIndex.value = 0
  matchCount.value = 0
  currentMatch.value = 0
}

const updateMatchCount = () => {
  if (!findText.value) {
    matchCount.value = 0
    currentMatch.value = 0
    return
  }

  const flags = caseSensitive.value ? 'g' : 'gi'
  const pattern = useRegex.value ? findText.value : escapeRegExp(findText.value)

  try {
    const regex = new RegExp(pattern, flags)
    const matches = content.value.match(regex)
    matchCount.value = matches ? matches.length : 0
  } catch (e) {
    matchCount.value = 0
  }
}

const escapeRegExp = (string: string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const findNext = () => {
  if (!findText.value) return

  const flags = caseSensitive.value ? 'g' : 'gi'
  const pattern = useRegex.value ? findText.value : escapeRegExp(findText.value)

  try {
    const regex = new RegExp(pattern, flags)
    const matches = [...content.value.matchAll(regex)]

    if (matches.length === 0) {
      currentMatch.value = 0
      return
    }

    const cursorPos = textareaRef.value?.selectionEnd || 0
    let found = false

    for (let i = 0; i < matches.length; i++) {
      const match = matches[i]
      if (match.index !== undefined && match.index >= cursorPos) {
        selectMatch(match.index, match[0].length)
        currentMatch.value = i + 1
        found = true
        break
      }
    }

    if (!found && matches.length > 0) {
      const firstMatch = matches[0]
      if (firstMatch.index !== undefined) {
        selectMatch(firstMatch.index, firstMatch[0].length)
        currentMatch.value = 1
      }
    }
  } catch (e) {
    console.error('查找失败:', e)
  }
}

const findPrevious = () => {
  if (!findText.value) return

  const flags = caseSensitive.value ? 'g' : 'gi'
  const pattern = useRegex.value ? findText.value : escapeRegExp(findText.value)

  try {
    const regex = new RegExp(pattern, flags)
    const matches = [...content.value.matchAll(regex)]

    if (matches.length === 0) {
      currentMatch.value = 0
      return
    }

    const cursorPos = textareaRef.value?.selectionStart || 0
    let found = false

    for (let i = matches.length - 1; i >= 0; i--) {
      const match = matches[i]
      if (match.index !== undefined && match.index < cursorPos) {
        selectMatch(match.index, match[0].length)
        currentMatch.value = i + 1
        found = true
        break
      }
    }

    if (!found && matches.length > 0) {
      const lastMatch = matches[matches.length - 1]
      if (lastMatch.index !== undefined) {
        selectMatch(lastMatch.index, lastMatch[0].length)
        currentMatch.value = matches.length
      }
    }
  } catch (e) {
    console.error('查找失败:', e)
  }
}

const selectMatch = (start: number, length: number) => {
  if (!textareaRef.value) return

  textareaRef.value.focus()
  textareaRef.value.setSelectionRange(start, start + length)

  const lines = content.value.substring(0, start).split('\n').length
  textareaRef.value.scrollTop = (lines - 5) * lineHeightPx.value
}

const replaceCurrent = () => {
  if (!findText.value || !textareaRef.value) return

  const start = textareaRef.value.selectionStart
  const end = textareaRef.value.selectionEnd
  const selectedText = content.value.substring(start, end)

  const flags = caseSensitive.value ? '' : 'i'
  const pattern = useRegex.value ? findText.value : escapeRegExp(findText.value)

  try {
    const regex = new RegExp('^' + pattern + '$', flags)
    if (!regex.test(selectedText)) {
      findNext()
      return
    }

    const newText = useRegex.value
      ? selectedText.replace(new RegExp(pattern, flags), replaceText.value)
      : replaceText.value

    content.value = content.value.substring(0, start) + newText + content.value.substring(end)
    
    setTimeout(findNext, 0)
  } catch (e) {
    console.error('替换失败:', e)
  }
}

const replaceAll = () => {
  if (!findText.value) return

  const flags = caseSensitive.value ? 'g' : 'gi'
  const pattern = useRegex.value ? findText.value : escapeRegExp(findText.value)

  try {
    const regex = new RegExp(pattern, flags)
    const matches = content.value.match(regex)
    const count = matches ? matches.length : 0

    if (count === 0) return

    content.value = content.value.replace(regex, replaceText.value)
    
    updateMatchCount()
    currentMatch.value = 0

    console.log(`替换了 ${count} 处`)
  } catch (e) {
    console.error('替换全部失败:', e)
  }
}

// ==================== 生命周期 ====================

onMounted(async () => {
  themeStore.load()
  await setupDragListeners()
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
  position: relative;
}

/* ==================== 主题定义 ==================== */

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

.titlebar {
  height: 32px;
  background: var(--titlebar-bg);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  border-bottom: 1px solid var(--border);
  user-select: none;
  flex-shrink: 0;
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
  app-region: no-drag;
}

.window-controls button:hover {
  background: var(--surface);
}

.toolbar {
  height: 40px;
  background: var(--surface);
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
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

.editor-container {
  flex: 1;
  display: flex;
  overflow: hidden;
  position: relative;
}

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
  flex-shrink: 0;
}

.line-number {
  height: v-bind('lineHeightPx + "px"');
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.line-number.active {
  color: var(--primary);
  font-weight: bold;
}

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
  line-height: 1.6;
}

.editor::placeholder {
  color: var(--text-muted);
}

.editor::selection {
  background: var(--accent);
}

.statusbar {
  height: 24px;
  background: var(--primary);
  color: white;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  font-size: 12px;
  flex-shrink: 0;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

/* 拖拽遮罩 */
.drag-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 123, 255, 0.2);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.2s ease;
}

.drag-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 40px 60px;
  background: rgba(0, 0, 0, 0.6);
  border-radius: 16px;
  border: 2px dashed rgba(255, 255, 255, 0.3);
}

.drag-icon {
  font-size: 48px;
  animation: bounce 1s infinite;
}

.drag-text {
  font-size: 18px;
  color: white;
  font-weight: 500;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}

/* 查找替换面板 */
.find-replace-panel {
  position: absolute;
  top: 80px;
  right: 20px;
  width: 320px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  z-index: 100;
  animation: slideIn 0.2s ease;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.find-replace-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}

.find-replace-header span {
  font-size: 14px;
  font-weight: 600;
}

.find-replace-header button {
  background: transparent;
  border: none;
  color: var(--text);
  cursor: pointer;
  font-size: 16px;
  padding: 4px;
  line-height: 1;
}

.find-replace-header button:hover {
  color: var(--primary);
}

.find-replace-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.input-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.find-input,
.replace-input {
  flex: 1;
  background: var(--bg);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 13px;
}

.find-input:focus,
.replace-input:focus {
  outline: none;
  border-color: var(--primary);
}

.match-info {
  font-size: 12px;
  color: var(--text-muted);
  min-width: 50px;
  text-align: right;
}

.options-row {
  display: flex;
  gap: 16px;
}

.option {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-muted);
  cursor: pointer;
}

.option input[type="checkbox"] {
  cursor: pointer;
}

.buttons-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.buttons-row button {
  flex: 1;
  min-width: 60px;
  background: var(--bg);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
}

.buttons-row button:hover {
  background: var(--primary);
  border-color: var(--primary);
  color: white;
}
</style>