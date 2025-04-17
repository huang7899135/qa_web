<template>
    <div v-if="templateFiles.length > 0" class="message-references">
        <h4 @click="openDownloadDrawer" role="button" tabindex="0" aria-label="打开模板文件下载选项">
            <!-- <el-icon><Link /></el-icon>  -->
            模板下载
            <el-tooltip content="点击选择模板文件下载" placement="top">
                <el-icon style="margin-left: 5px; cursor: pointer;"><Download /></el-icon>
            </el-tooltip>
        </h4>
        <!-- 直接显示模板文件列表 -->
        <ul class="template-file-list-inline">
            <!-- 添加点击事件到 li 元素 -->
            <li v-for="templateFile in templateFiles" :key="templateFile" class="template-file-item-inline" @click="openDownloadDrawer" role="button" tabindex="0" :aria-label="`打开 ${templateFile} 的下载选项`">
                <!-- 使用动态图标 -->
                <component :is="getIconForFile(templateFile)" class="file-icon-inline" />
                <span class="file-name-inline" :title="templateFile">{{ templateFile }}</span>
            </li>
        </ul>

        <!-- 下载模板文件抽屉 -->
        <el-drawer v-model="downloadDrawerVisible" title="选择要下载的模板文件" direction="btt" size="auto"
                   @closed="resetDownloadDrawer" custom-class="download-drawer" :with-header="true">

            <!-- 抽屉内容区域 -->
            <div v-if="templateFiles.length > 0" class="download-file-list-drawer">
                 <div v-for="templateFile in templateFiles" :key="templateFile" class="download-file-item-drawer">
                     <div class="file-item-content-drawer">
                         <!-- 使用动态图标 -->
                         <component :is="getIconForFile(templateFile)" class="file-icon-drawer" />
                         <span class="file-name-drawer" :title="templateFile">{{ templateFile }}</span>
                     </div>
                     <el-button
                         type="primary"
                         link
                         size="small"
                         @click="copySingleFileLink(templateFile)"
                         :loading="loadingStates[templateFile]"
                         :icon="CopyDocument">
                         复制下载链接
                     </el-button>
                 </div>
            </div>
             <p v-else>没有可供选择的模板文件。</p>

            <!-- 抽屉底部操作 -->
            <template #footer>
                <div style="display: flex; justify-content: flex-end; align-items: center; width: 100%;">
                    <el-button @click="downloadDrawerVisible = false">关闭</el-button>
                </div>
            </template>
        </el-drawer>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, shallowRef, type Component } from 'vue'; // 引入 shallowRef 和 Component
import { ElDrawer, ElButton, ElIcon, ElTooltip, ElMessage } from 'element-plus';
import { Link, Download, CopyDocument } from '@element-plus/icons-vue';
import { copyToClipboard } from '@/utils/clipboard.ts';
// 引入所有需要的图标组件
import GenericFileIcon from './icons/GenericFileIcon.vue';
import PdfIcon from './icons/PdfIcon.vue';
import WordIcon from './icons/WordIcon.vue';
import ExcelIcon from './icons/ExcelIcon.vue';
import MarkdownIcon from './icons/MarkdownIcon.vue';
// --- 新增：引入 WebLinkIcon ---
import WebLinkIcon from './icons/WebLinkIcon.vue';
import type { MessageMetadata } from '@/types/ChatMessageType';
import type { RetrieverResource } from '@/api';

const props = defineProps<{
    metadata?: MessageMetadata | null;
}>();

// --- 下载抽屉状态 ---
const downloadDrawerVisible = ref(false);
const loadingStates = reactive<Record<string, boolean>>({});

// --- 计算属性：提取并去重模板文件 ---
const templateFiles = computed((): string[] => {
    const resources = props.metadata?.retriever_resources || [];
    if (!resources || resources.length === 0) return [];
    // 过滤掉分数小于等于 0.50 的资源
    const filteredResources = resources.filter(res => typeof res.score === 'number' && res.score > 0.50);

    const allTemplateStrings = filteredResources
        .map(res => res.doc_metadata?.template)
        .filter(template => typeof template === 'string' && template.trim() !== '');

    if (allTemplateStrings.length === 0) return [];

    const uniqueTemplates = new Set<string>();
    allTemplateStrings.forEach(templateString => {
        templateString!.split(',')
            .map(name => name.trim())
            .filter(name => name !== '')
            .forEach(name => uniqueTemplates.add(name));
    });

    const files = Array.from(uniqueTemplates).sort();
    files.forEach(file => {
        if (loadingStates[file] === undefined) {
            loadingStates[file] = false;
        }
    });
    return files;
});

const getIconForFile = (fileNameOrUrl: string): Component => {
    console.log("获取文件图标，名称/URL:", fileNameOrUrl);
    if (!fileNameOrUrl) return GenericFileIcon;

    const lowerCaseName = fileNameOrUrl.toLowerCase();

    // 检查是否为 URL
    if (lowerCaseName.startsWith('http://') || lowerCaseName.startsWith('https://')) {
        console.log("匹配到 Web 链接图标");
        return WebLinkIcon;
    }

    // 提取文件扩展名
    const extension = lowerCaseName.split('.').pop();

    switch (extension) {
        case 'pdf':
            console.log("匹配到 PDF 文件图标");
            return PdfIcon;
        case 'doc':
        case 'docx':
            console.log("匹配到 Word 文件图标");
            return WordIcon;
        case 'xls':
        case 'xlsx':
            console.log("匹配到 Excel 文件图标");
            return ExcelIcon;
        case 'md':
            console.log("匹配到 Markdown 文件图标");
            return MarkdownIcon;
        default:
            console.log("未匹配到特定图标，使用通用文件图标");
            return GenericFileIcon;
    }
};

// --- 点击标题或文件名打开抽屉 ---
const openDownloadDrawer = () => {
    if (templateFiles.value.length > 0) {
        downloadDrawerVisible.value = true;
    } else {
        // 如果列表为空，点击标题时不提示，因为没有可点击的文件名
        // ElMessage.info('没有可供下载的模板文件。');
    }
};

// 重置抽屉状态
const resetDownloadDrawer = () => {
    Object.keys(loadingStates).forEach(key => {
        loadingStates[key] = false;
    });
};

// --- 为单个文件生成并复制下载链接 ---
const copySingleFileLink = async (templateName: string) => {
    if (loadingStates[templateName]) return;

    loadingStates[templateName] = true;
    try {
        const downloadLink = await fetchTemplateDownloadLink([templateName]);
        if (downloadLink) {
            copyToClipboard(downloadLink);
            // ElMessage.success(`模板文件 "${templateName}" 的下载链接已复制！`);
        } else {
            // ElMessage.error(`无法为 "${templateName}" 生成下载链接。`);
        }
    } catch (error) {
        console.error(`生成模板 "${templateName}" 下载链接失败:`, error);
        // ElMessage.error(`生成 "${templateName}" 下载链接时出错。`);
    } finally {
        loadingStates[templateName] = false;
    }
};


// --- 获取模板下载链接的后端 API 调用函数 (保持不变) ---
async function fetchTemplateDownloadLink(templateNames: string[]): Promise<string | null> {
    console.log("准备调用后端 API 生成模板下载链接，模板文件:", templateNames);
    // -------- 模拟 API 调用 --------
    return new Promise((resolve) => {
        setTimeout(() => {
            const simulatedLink = `http://nas.visionblue.cloud:8090/documents/template/${encodeURIComponent(templateNames[0])}`;
            console.log("模拟生成模板下载链接:", simulatedLink);
            resolve(simulatedLink);
        }, 100); // 模拟网络延迟
    });
     // -------- 模拟结束 --------
}

</script>

<style scoped>
/* --- 基本样式 --- */
.message-references {
    margin-top: 15px;
    padding-top: 10px;
    border-top: 1px solid #eee;
}

.message-references h4 {
    font-size: 0.9em;
    color: #606266;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 600;
    cursor: pointer;
}
.message-references h4:hover {
    color: var(--el-color-primary);
}

/* --- 直接显示的模板文件列表样式 --- */
.template-file-list-inline {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
}

.template-file-item-inline {
    display: flex;
    align-items: center;
    /* background-color: #f4f4f5; */
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 0.85em;
    color: #606266;
    cursor: pointer; /* 添加手型光标 */
    transition: background-color 0.2s ease, color 0.2s ease;
}
.template-file-item-inline:hover {
    background-color: var(--el-color-primary-light-9);
    color: var(--el-color-primary);
}

.file-icon-inline {
    width: 24px;
    height: 24px;
    margin-right: 5px;
    flex-shrink: 0;
}

.file-name-inline {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 200px;
    font-size: 14px; 

}


/* --- 下载抽屉样式调整 --- */
:deep(.download-drawer) {
    max-height: 70vh;
}
:deep(.download-drawer .el-drawer__header) {
    margin-bottom: 10px;
    padding: 15px 20px 10px 20px;
    border-bottom: 1px solid #eee;
}
:deep(.download-drawer .el-drawer__body) {
    padding: 15px 20px;
    overflow-y: auto;
}
:deep(.download-drawer .el-drawer__footer) {
     padding: 10px 20px;
     border-top: 1px solid #eee;
     box-shadow: 0 -2px 5px rgba(0,0,0,0.05);
}

.download-file-list-drawer {
    overflow-y: auto;
    padding-bottom: 10px;
}

.download-file-item-drawer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
    padding: 8px 5px;
    transition: background-color 0.2s ease;
    border-radius: 4px;
    border-bottom: 1px solid #f0f0f0;
}
.download-file-item-drawer:last-child {
    border-bottom: none;
}
.download-file-item-drawer:hover {
    background-color: #f8f9fa;
}

.file-item-content-drawer {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-grow: 1;
    overflow: hidden;
    margin-right: 15px;
}

.file-icon-drawer {
    width: 22px;
    height: 22px;
    flex-shrink: 0;
}

.file-name-drawer {
    font-size: 14px;
    color: #303133;
    white-space: normal;
    word-break: break-all;
    line-height: 1.4;
    overflow: hidden;
    text-overflow: ellipsis;
}

.download-file-item-drawer .el-button {
    flex-shrink: 0;
}

</style>