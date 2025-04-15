<template>
    <div v-if="uniqueReferences.length > 0" class="message-references">
        <h4>
            <el-icon><Link /></el-icon> 相关资料
        </h4>
        <div class="reference-list">
            <!-- 引用项 -->
            <div v-for="ref in uniqueReferences" :key="getReferenceKey(ref)"
                class="reference-item" @click="handleReferenceClick(ref)" role="button" tabindex="0"
                 :aria-label="`${ getFileInfo(ref.document_name || ref.content).type === 'web' ? '打开链接' : '准备下载/预览' } ${ref.document_name || '未知来源'}`">
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
                                <span class="file-name-drawer">{{ ref.document_name || ref.content?.slice(0,50) + '...' || '未知来源' }}</span>
                            </div>
                        </el-checkbox>
                        <!-- 添加预览按钮 -->
                        <el-button
                            v-if="canPreview(ref)"
                            type="primary"
                            link
                            size="small"
                            @click.stop="handlePreviewClick(ref)"
                            class="preview-button-drawer">
                            预览
                        </el-button>
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

        <!-- 预览弹窗 -->
        <el-dialog
            v-model="previewDialogVisible"
            :title="`预览: ${previewFile.name}`"
            width="80%"
            top="5vh"
            append-to-body
            destroy-on-close
            custom-class="preview-dialog">
            <div v-if="previewFile.loading" class="preview-loading">
                正在加载预览...
            </div>
            <div v-else-if="previewFile.error" class="preview-error">
                加载预览失败: {{ previewFile.error }}
            </div>
            <iframe
                v-else-if="previewFile.url"
                :src="previewFile.url"
                width="100%"
                height="600px"
                frameborder="0"
                class="preview-iframe">
            </iframe>
             <p v-else>无法获取预览内容。</p>

            <template #footer>
                <span class="dialog-footer">
                    <el-button @click="previewDialogVisible = false">关闭</el-button>
                    <el-button type="primary" @click="handleDownloadSingleFile(previewFile.key)" :disabled="!previewFile.key || previewFile.loading || !!previewFile.error">
                        下载此文件
                    </el-button>
                </span>
            </template>
        </el-dialog>

    </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { ElDrawer, ElButton, ElIcon, ElTooltip, ElMessage, ElCheckbox, ElCheckboxGroup, ElDialog } from 'element-plus'; // 引入 ElDialog
import { Link } from '@element-plus/icons-vue';
import { copyToClipboard } from '@/utils/clipboard.ts';
import PdfIcon from './icons/PdfIcon.vue';
import ExcelIcon from './icons/ExcelIcon.vue';
import WordIcon from './icons/WordIcon.vue';
import MarkdownIcon from './icons/MarkdownIcon.vue';
import WebLinkIcon from './icons/WebLinkIcon.vue';
import GenericFileIcon from './icons/GenericFileIcon.vue';
import type { MessageMetadata } from '@/types/ChatMessageType';
import type { RetrieverResource } from '@/api';

interface ProcessedReference extends RetrieverResource {
    contentSnippet?: string;
}

const props = defineProps<{
    metadata?: MessageMetadata | null;
}>();

// --- 下载抽屉状态 ---
const downloadDrawerVisible = ref(false);
const initialClickedRefKey = ref<string | null>(null);
const selectedFileIds = ref<string[]>([]);
const isGeneratingLink = ref(false);

// --- 预览弹窗状态 ---
const previewDialogVisible = ref(false);
const previewFile = ref<{ key: string | null; name: string; type: 'pdf' | 'word' | 'other'; url: string | null; loading: boolean; error: string | null }>({
    key: null,
    name: '',
    type: 'other',
    url: null,
    loading: false,
    error: null,
});

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
    // 优先使用 document_id，如果不存在，尝试 segment_id，最后使用 content 的一部分作为后备
    return ref.document_id || (ref.segment_id ? `segment-${ref.segment_id}` : `content-${ref.content?.slice(0, 30)}`);
};


// --- 文件类型与图标判断 ---
const getFileInfo = (nameOrUrl: string | undefined): { type: 'file' | 'web' | 'unknown', icon: any, fileType: 'pdf' | 'word' | 'excel' | 'markdown' | 'web' | 'other' } => {
    if (!nameOrUrl) return { type: 'unknown', icon: GenericFileIcon, fileType: 'other' };

    const lowerCaseName = nameOrUrl.toLowerCase();

    if (lowerCaseName.startsWith('http://') || lowerCaseName.startsWith('https://')) {
        return { type: 'web', icon: WebLinkIcon, fileType: 'web' };
    }
    if (lowerCaseName.endsWith('.pdf')) return { type: 'file', icon: PdfIcon, fileType: 'pdf' };
    if (lowerCaseName.endsWith('.doc') || lowerCaseName.endsWith('.docx')) return { type: 'file', icon: WordIcon, fileType: 'word' };
    if (lowerCaseName.endsWith('.xls') || lowerCaseName.endsWith('.xlsx')) return { type: 'file', icon: ExcelIcon, fileType: 'excel' };
    if (lowerCaseName.endsWith('.md')) return { type: 'file', icon: MarkdownIcon, fileType: 'markdown' };

    // 默认认为是文件类型，但具体文件类型是 other
    return { type: 'file', icon: GenericFileIcon, fileType: 'other' };
};

// --- 判断文件是否可预览 ---
const canPreview = (refData: ProcessedReference): boolean => {
    const fileInfo = getFileInfo(refData.document_name || refData.content);
    return fileInfo.fileType === 'pdf' || fileInfo.fileType === 'word';
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
        // 点击文件类型，总是打开下载/预览抽屉
        initialClickedRefKey.value = refKey;
        // 默认选中点击的这个文件，方便用户直接下载或预览
        selectedFileIds.value = [refKey];
        downloadDrawerVisible.value = true;
        handleCheckedFilesChange(selectedFileIds.value); // 更新全选状态
    }
};

// --- 下载抽屉逻辑 ---
const isSelectAll = ref(false);
const isIndeterminate = ref(false);

const handleCheckedFilesChange = (value: (string | number | boolean)[]) => {
    const checkedCount = value.length;
    isSelectAll.value = checkedCount === uniqueReferences.value.length && checkedCount > 0;
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

// --- 预览逻辑 ---
const handlePreviewClick = async (refData: ProcessedReference) => {
    const fileInfo = getFileInfo(refData.document_name || refData.content);
    const refKey = getReferenceKey(refData);
    const fileName = refData.document_name || '未知文件';

    if (!refKey || !canPreview(refData)) {
        ElMessage.warning('此文件类型不支持预览。');
        return;
    }

    previewFile.value = { key: refKey, name: fileName, type: fileInfo.fileType as 'pdf' | 'word', url: null, loading: true, error: null };
    previewDialogVisible.value = true;

    try {
        // !!! 关键: 调用后端 API 获取预览 URL !!!
        const previewUrl = await fetchPreviewUrl(refKey, fileInfo.fileType as 'pdf' | 'word');

        if (previewUrl) {
            previewFile.value.url = previewUrl;
        } else {
            previewFile.value.error = '无法获取预览链接。';
            ElMessage.error(`无法获取 ${fileName} 的预览链接。`);
        }
    } catch (error: any) {
        console.error('获取预览链接失败:', error);
        previewFile.value.error = error.message || '获取预览链接时发生未知错误。';
        ElMessage.error(`获取 ${fileName} 的预览链接时出错。`);
    } finally {
        previewFile.value.loading = false;
    }
};

// --- 假设的获取预览 URL 的后端 API 调用函数 (需要你自己实现) ---
async function fetchPreviewUrl(fileKey: string, fileType: 'pdf' | 'word'): Promise<string | null> {
    console.log(`准备调用后端 API 获取预览 URL，文件 Key: ${fileKey}, 类型: ${fileType}`);
    // -------- 模拟 API 调用 (用于测试，请替换为真实逻辑) --------
    // 1. 对于 PDF，有时可以直接构造 URL (如果你的存储允许公开访问或有签名 URL 机制)
    // 2. 对于 Word，几乎总是需要后端转换并返回一个可预览的 URL (如转换后的 PDF 或特定预览服务 URL)
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            // 模拟成功获取 PDF 预览链接 (假设可以直接访问)
            if (fileType === 'pdf' && fileKey.startsWith('doc-')) { // 假设 document_id 开头的可以直接访问
                 // 替换为你的实际 PDF 文件访问路径或生成签名 URL 的逻辑
                const simulatedPdfUrl = `/api/files/view/${fileKey}.pdf`; // 示例 URL 结构
                console.log("模拟获取 PDF 预览 URL:", simulatedPdfUrl);
                resolve(simulatedPdfUrl);
            }
            // 模拟成功获取 Word 预览链接 (假设后端转换为了 PDF)
            else if (fileType === 'word' && fileKey.startsWith('doc-')) {
                 // 替换为你的后端转换服务返回的预览 URL
                const simulatedWordPreviewUrl = `/api/files/preview/${fileKey}?format=pdf`; // 示例 URL 结构
                console.log("模拟获取 Word 预览 URL:", simulatedWordPreviewUrl);
                resolve(simulatedWordPreviewUrl);
            }
             // 模拟获取失败的情况
            else {
                 console.error("模拟获取预览 URL 失败，无法处理此 Key 或类型");
                 resolve(null); // 或者 reject(new Error('无法生成预览链接'));
            }
        }, 1000); // 模拟网络延迟
    });
    // -------- 模拟结束 --------
}


// --- 生成并复制批量下载链接 ---
const generateAndCopyDownloadLink = async () => {
    if (selectedFileIds.value.length === 0) {
        ElMessage.warning('请至少选择一个文件。');
        return;
    }
    isGeneratingLink.value = true;
    try {
        // 调用 fetchDownloadLink 获取批量下载链接
        const downloadLink = await fetchDownloadLink(selectedFileIds.value);
        if (downloadLink) {
            copyToClipboard(downloadLink);
            ElMessage.success(`已生成 ${selectedFileIds.value.length} 个文件的下载链接并复制到剪贴板！`);
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

// --- 下载单个文件 (预览弹窗中使用) ---
const handleDownloadSingleFile = async (fileKey: string | null) => {
    if (!fileKey) {
        ElMessage.warning('无效的文件标识，无法下载。');
        return;
    }
    ElMessage.info('正在准备下载...'); // 提示用户
    try {
        // 调用 fetchDownloadLink 获取单个文件的下载链接
        // 注意：fetchDownloadLink 需要能处理单个 key 的情况，或者你有单独的单文件下载接口
        const downloadLink = await fetchDownloadLink([fileKey]); // 复用批量下载函数，传入单个 key 的数组
        if (downloadLink) {
            // 触发浏览器下载
            // 对于临时链接，直接打开通常能触发下载
            // 如果是 API 返回文件流，则需要更复杂的处理 (创建 Blob URL)
            window.open(downloadLink, '_blank');
            // previewDialogVisible.value = false; // 可选：下载后关闭预览
        } else {
            ElMessage.error('无法获取下载链接，请稍后重试。');
        }
    } catch (error) {
        console.error('下载单个文件失败:', error);
        ElMessage.error('下载文件时出错。');
    }
};


// --- 假设的获取下载链接的后端 API 调用函数 (保持不变或稍作调整以支持单文件) ---
async function fetchDownloadLink(fileKeys: string[]): Promise<string | null> {
    console.log("准备调用后端 API 生成下载链接，文件 Keys:", fileKeys);
    // -------- 模拟 API 调用 (用于测试，请替换为真实逻辑) --------
    // 后端应能根据 keys 生成一个临时的、包含这些文件的打包文件下载链接，或单个文件的直接链接
    return new Promise((resolve) => {
        setTimeout(() => {
            // 如果只有一个 key，可以返回直接的文件链接（如果后端支持）
            // if (fileKeys.length === 1) {
            //     const simulatedDirectLink = `/api/files/download/${fileKeys[0]}`;
            //     console.log("模拟生成单个文件下载链接:", simulatedDirectLink);
            //     resolve(simulatedDirectLink);
            //     return;
            // }
            // 否则返回批量打包链接
            const simulatedLink = `https://your-domain.com/download/temp/${Date.now()}?keys=${encodeURIComponent(fileKeys.join(','))}`;
            console.log("模拟生成下载链接:", simulatedLink);
            resolve(simulatedLink);
        }, 1500);
    });
     // -------- 模拟结束 --------
}


</script>

<style scoped>
/* --- 基本引用列表样式 (保持或微调) --- */
.message-references {
    margin-top: 15px;
    padding-top: 10px;
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
:deep(.download-drawer .el-drawer__header) {
    margin-bottom: 10px;
    padding: 15px 20px 10px 20px;
    border-bottom: 1px solid #eee;
}
:deep(.download-drawer .el-drawer__body) {
    padding: 15px 20px;
}
:deep(.download-drawer .el-drawer__footer) {
     padding: 10px 20px;
     border-top: 1px solid #eee;
     box-shadow: 0 -2px 5px rgba(0,0,0,0.05);
}

.download-file-list-drawer {
    max-height: calc(100% - 50px);
    overflow-y: auto;
    padding-bottom: 10px;
}

.select-all-checkbox-drawer {
    margin-bottom: 15px;
    display: block;
    padding-bottom: 10px;
    border-bottom: 1px solid #eee;
}

.download-file-item-drawer {
    display: flex; /* 使用 flex 布局 */
    justify-content: space-between; /* 让内容和按钮分开 */
    align-items: center; /* 垂直居中 */
    margin-bottom: 8px;
    padding: 6px 5px 6px 0; /* 调整内边距 */
    transition: background-color 0.2s ease;
    border-radius: 4px;
}
.download-file-item-drawer:hover {
    background-color: #f8f9fa;
}

/* 让 checkbox 部分占据主要空间 */
.download-file-item-drawer .el-checkbox {
    flex-grow: 1; /* 占据剩余空间 */
    display: flex;
    align-items: center;
    margin-right: 10px; /* 与预览按钮间距 */
}
.download-file-item-drawer .el-checkbox__label {
     flex-grow: 1;
     padding-left: 0;
     display: contents; /* 修复 label 内部布局问题 */
}

.file-item-content-drawer {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-left: 8px;
    /* 限制文件名宽度，防止挤压预览按钮 */
    max-width: calc(100% - 40px); /* 减去图标和可能的边距 */
    overflow: hidden;
}

.file-icon-drawer {
    width: 22px;
    height: 22px;
    flex-shrink: 0;
}

.file-name-drawer {
    font-size: 14px;
    color: #303133;
    white-space: normal; /* 允许换行 */
    word-break: break-all;
    line-height: 1.4;
    /* 防止文件名过长 */
    overflow: hidden;
    text-overflow: ellipsis;
    /* display: -webkit-box; */ /* 如果需要限制行数 */
    /* -webkit-line-clamp: 2; */
    /* -webkit-box-orient: vertical; */
}

.preview-button-drawer {
    flex-shrink: 0; /* 防止按钮被压缩 */
    margin-left: auto; /* 将按钮推到最右边（如果flex布局允许） */
    padding: 4px 8px; /* 调整按钮大小 */
}

/* --- 预览弹窗样式 --- */
:deep(.preview-dialog .el-dialog__body) {
    padding: 10px 20px; /* 减少 body 内边距 */
    min-height: 610px; /* 给 iframe 留出空间 */
    position: relative; /* 用于定位加载/错误提示 */
}
:deep(.preview-dialog .el-dialog__footer) {
    padding: 10px 20px;
    border-top: 1px solid #eee;
}

.preview-loading,
.preview-error {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 16px;
    color: #606266;
}
.preview-error {
    color: var(--el-color-danger);
    max-width: 80%;
    text-align: center;
}

.preview-iframe {
    border: 1px solid #eee; /* 给 iframe 一个边框 */
}

.dialog-footer {
    display: flex;
    justify-content: flex-end; /* 按钮靠右 */
    width: 100%;
}

</style>