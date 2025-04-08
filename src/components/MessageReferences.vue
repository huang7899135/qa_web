<template>
    <div v-if="uniqueReferences.length > 0" class="message-references">
        <h4>
            <el-icon><Link /></el-icon> 相关资料
        </h4>
        <div class="reference-list">
            <!-- 引用项，点击触发下载抽屉 -->
            <div v-for="ref in uniqueReferences" :key="getReferenceKey(ref)"
                class="reference-item" @click="handleReferenceClick(ref)" role="button" tabindex="0"
                 :aria-label="`准备下载 ${ref.document_name || '未知来源'}`">
                 <!-- 彩色文件类型图标 -->
                <component :is="getFileInfo(ref.document_name || ref.content).icon" class="file-icon" />
                <el-tooltip :content="ref.document_name || '未知来源'" placement="top"
                    :disabled="!ref.document_name || ref.document_name.length < 30">
                    <span class="doc-name">{{ ref.document_name || '未知来源' }}</span>
                </el-tooltip>
            </div>
        </div>

        <!-- 下载文件抽屉 -->
        <el-drawer v-model="downloadDrawerVisible" title="选择要下载的文件" direction="btt" size="60%"
                   @closed="resetDownloadDrawer" custom-class="download-drawer" :with-header="true">

            <!-- 抽屉内容区域 -->
            <div v-if="uniqueReferences.length > 0" class="download-file-list-drawer">
                <el-checkbox v-model="isSelectAll" :indeterminate="isIndeterminate" @change="handleSelectAllChange"
                             class="select-all-checkbox-drawer">
                    全选 ({{ selectedFileIds.length }} / {{ uniqueReferences.length }})
                </el-checkbox>

                <el-checkbox-group v-model="selectedFileIds" @change="handleCheckedFilesChange">
                    <div v-for="ref in uniqueReferences" :key="getReferenceKey(ref)" class="download-file-item-drawer">
                         <el-checkbox :label="getReferenceKey(ref)" size="large">
                            <div class="file-item-content-drawer">
                                <component :is="getFileInfo(ref.document_name || ref.content).icon" class="file-icon-drawer" />
                                <span class="file-name-drawer">{{ ref.document_name || ref.content.slice(0,50) + '...' || '未知来源' }}</span>
                            </div>
                        </el-checkbox>
                    </div>
                </el-checkbox-group>
            </div>
             <p v-else>没有可供选择的文件。</p>

            <!-- 抽屉底部操作 -->
            <template #footer>
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                    <el-button @click="downloadDrawerVisible = false">取消</el-button>
                    <el-button type="primary" @click="generateAndCopyDownloadLink"
                               :loading="isGeneratingLink" :disabled="selectedFileIds.length === 0">
                        {{ isGeneratingLink ? '正在生成...' : `生成并复制 (${selectedFileIds.length})` }}
                    </el-button>
                </div>
            </template>
        </el-drawer>
    </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'; // 移除 watch, 因为状态管理在组件内部
import { ElDrawer, ElButton, ElIcon, ElTooltip, ElMessage, ElCheckbox, ElCheckboxGroup } from 'element-plus';
// 引入 Element Plus 图标
import { Link } from '@element-plus/icons-vue';
// 引入自定义彩色 SVG 图标组件 (确保这些组件是彩色的)
import { copyToClipboard } from '@/utils/clipboard.ts';
import PdfIcon from './icons/PdfIcon.vue';
import ExcelIcon from './icons/ExcelIcon.vue';
import WordIcon from './icons/WordIcon.vue';
import MarkdownIcon from './icons/MarkdownIcon.vue';
import WebLinkIcon from './icons/WebLinkIcon.vue'; // 假设有一个网页链接图标
import GenericFileIcon from './icons/GenericFileIcon.vue'; // 假设有一个通用的彩色文件图标
// 类型定义
import type { MessageMetadata } from '@/types/ChatMessageType';
import type { RetrieverResource } from '@/api'; // 确保这个类型是正确的

// 定义处理后的引用类型
interface ProcessedReference extends RetrieverResource {
    contentSnippet?: string;
}

const props = defineProps<{
    metadata?: MessageMetadata | null;
}>();

// --- 下载抽屉状态 ---
const downloadDrawerVisible = ref(false);
const initialClickedRefKey = ref<string | null>(null); // 存储初始点击项的 Key
const selectedFileIds = ref<string[]>([]); // 存储选中的文件 Key
const isGeneratingLink = ref(false);

// --- 计算属性：处理并去重引用资源 ---
const uniqueReferences = computed((): ProcessedReference[] => {
    const resources = props.metadata?.retriever_resources || [];
    if (!resources || resources.length === 0) return [];

    const uniqueMap = new Map<string, ProcessedReference>();
    resources.forEach(res => {
        const key = getReferenceKey(res);
        if (!key) return;

        const existing = uniqueMap.get(key);
        if (!existing || (typeof res.score === 'number' && typeof existing.score === 'number' && res.score > existing.score)) {
            const snippet = res.content ? res.content.substring(0, 80) + (res.content.length > 80 ? '...' : '') : undefined;
            uniqueMap.set(key, { ...res, contentSnippet: snippet });
        }
    });
    return Array.from(uniqueMap.values()).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
});

// --- 生成引用项的唯一 Key ---
const getReferenceKey = (ref: RetrieverResource): string => {
    return ref.document_id || (ref.segment_id ? `segment-${ref.segment_id}` : `content-${ref.content?.slice(0, 30)}`);
};

// --- 文件类型与图标判断 (返回彩色 SVG 组件) ---
const getFileInfo = (nameOrUrl: string): { type: 'file' | 'web' | 'unknown', icon: any } => {
    if (!nameOrUrl) return { type: 'unknown', icon: GenericFileIcon };

    const lowerCaseName = nameOrUrl.toLowerCase();

    if (lowerCaseName.startsWith('http://') || lowerCaseName.startsWith('https://')) {
        return { type: 'web', icon: WebLinkIcon };
    }
    if (lowerCaseName.endsWith('.pdf')) return { type: 'file', icon: PdfIcon };
    if (lowerCaseName.endsWith('.doc') || lowerCaseName.endsWith('.docx')) return { type: 'file', icon: WordIcon };
    if (lowerCaseName.endsWith('.xls') || lowerCaseName.endsWith('.xlsx')) return { type: 'file', icon: ExcelIcon };
    if (lowerCaseName.endsWith('.md')) return { type: 'file', icon: MarkdownIcon };

    return { type: 'file', icon: GenericFileIcon };
};

// --- 点击引用项的处理 ---
const handleReferenceClick = (refData: ProcessedReference) => {
    const fileInfo = getFileInfo(refData.document_name || refData.content);
    const refKey = getReferenceKey(refData);

    if (!refKey) {
         ElMessage.warning('无法识别此引用项。');
         return;
    }

    if (fileInfo.type === 'web' && refData.content) {
        window.open(refData.content, '_blank', 'noopener,noreferrer');
    } else if (fileInfo.type === 'file' || fileInfo.type === 'unknown') {
        initialClickedRefKey.value = refKey;
        selectedFileIds.value = [refKey]; // 默认选中点击的这个
        downloadDrawerVisible.value = true; // 打开下载抽屉
        handleCheckedFilesChange(selectedFileIds.value); // 更新全选状态
    }
};

// --- 下载抽屉逻辑 ---
const isSelectAll = ref(false);
const isIndeterminate = ref(false);

const handleCheckedFilesChange = (value: (string | number | boolean)[]) => {
    const checkedCount = value.length;
    isSelectAll.value = checkedCount === uniqueReferences.value.length && checkedCount > 0; // 修复全选逻辑
    isIndeterminate.value = checkedCount > 0 && checkedCount < uniqueReferences.value.length;
};

const handleSelectAllChange = (val: boolean | string | number) => {
    selectedFileIds.value = val ? uniqueReferences.value.map(getReferenceKey) : [];
    isIndeterminate.value = false;
};

// 重置抽屉状态
const resetDownloadDrawer = () => {
    selectedFileIds.value = [];
    initialClickedRefKey.value = null;
    isGeneratingLink.value = false;
    isSelectAll.value = false;
    isIndeterminate.value = false;
};

// --- 生成并复制下载链接 ---
const generateAndCopyDownloadLink = async () => {
    if (selectedFileIds.value.length === 0) {
        ElMessage.warning('请至少选择一个文件。');
        return;
    }
    isGeneratingLink.value = true;
    try {
        const downloadLink = await fetchDownloadLink(selectedFileIds.value);
        if (downloadLink) {
            await copyToClipboard(downloadLink);
            // ElMessage.success('下载链接已生成并复制到剪贴板！');
            downloadDrawerVisible.value = false;
        } else {
            ElMessage.error('无法生成下载链接，请稍后重试。');
        }
    } catch (error) {
        console.error('生成下载链接失败:', error);
        ElMessage.error('生成下载链接时出错。');
    } finally {
        isGeneratingLink.value = false;
    }
};

// --- 假设的后端 API 调用函数 (需要你自己实现) ---
async function fetchDownloadLink(fileKeys: string[]): Promise<string | null> {
    console.log("准备调用后端 API 生成链接，文件 Keys:", fileKeys);
    // -------- 模拟 API 调用 (用于测试，请替换为真实逻辑) --------
    return new Promise((resolve) => {
        setTimeout(() => {
            const simulatedLink = `https://your-domain.com/download/temp/${Date.now()}?keys=${encodeURIComponent(fileKeys.join(','))}`;
            console.log("模拟生成链接:", simulatedLink);
            resolve(simulatedLink);
        }, 1500);
    });
     // -------- 模拟结束 --------
}


</script>

<style scoped>
/* --- 基本引用列表样式 (保持或微调) --- */
.message-references {
    margin-top: 15px; /* 增加与上方内容的间距 */
    padding-top: 10px;
    /* border-top: 1px solid #f0f0f0; 可选分隔线 */
}

.message-references h4 {
    font-size: 0.9em;
    color: #606266;
    margin-bottom: 10px;
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 600;
}

.reference-list {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
}

.reference-item {
    display: inline-flex;
    align-items: center;
    padding: 6px 12px;
    border: 1px solid #dcdfe6;
    border-radius: 16px;
    background-color: #fff;
    cursor: pointer;
    transition: all 0.2s ease-in-out;
    max-width: 300px;
    overflow: hidden;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
}

.reference-item:hover {
    border-color: var(--el-color-primary-light-3);
    background-color: var(--el-color-primary-light-9);
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.06);
}

.reference-item .file-icon {
    width: 20px;
    height: 20px;
    margin-right: 8px;
    flex-shrink: 0;
}

.reference-item .doc-name {
    font-size: 0.88em;
    color: #303133;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

/* --- 下载抽屉样式 --- */
/* 注意：Element Plus v2.7+ 可能使用 CSS 变量控制抽屉样式 */
:deep(.download-drawer .el-drawer__header) {
    margin-bottom: 10px; /* 减小头部下边距 */
    padding: 15px 20px 10px 20px;
    border-bottom: 1px solid #eee;
}
:deep(.download-drawer .el-drawer__body) {
    padding: 15px 20px; /* 主体区域内边距 */
}
:deep(.download-drawer .el-drawer__footer) {
     padding: 10px 20px;
     border-top: 1px solid #eee;
     box-shadow: 0 -2px 5px rgba(0,0,0,0.05); /* 页脚加一点阴影 */
}


.download-file-list-drawer {
    /* 限制列表高度，留出底部按钮空间 */
    /* 高度计算可能需要根据实际抽屉大小调整 */
    max-height: calc(100% - 50px); /* 假设底部按钮区域高度约50px */
    overflow-y: auto;
    padding-bottom: 10px; /* 列表底部留白 */
}

.select-all-checkbox-drawer {
    margin-bottom: 15px;
    display: block;
    padding-bottom: 10px;
    border-bottom: 1px solid #eee;
}

.download-file-item-drawer {
    margin-bottom: 8px; /* 减小列表项间距 */
    padding: 6px 0;
    transition: background-color 0.2s ease;
    border-radius: 4px;
}
.download-file-item-drawer:hover {
    background-color: #f8f9fa;
}

.download-file-item-drawer .el-checkbox {
    display: flex;
    width: 100%;
    align-items: center;
}
.download-file-item-drawer .el-checkbox__label {
     flex-grow: 1;
     padding-left: 0;
}

.file-item-content-drawer {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-left: 8px;
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
    line-height: 1.4; /* 调整行高 */
}

</style>
