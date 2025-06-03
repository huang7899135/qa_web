<template>
    <svg 
      class="icon" 
      viewBox="0 0 1024 1024" 
      version="1.1" 
      xmlns="http://www.w3.org/2000/svg" 
      :width="size" 
      :height="size"
    >
      <path 
        d="M32 32m160 0l640 0q160 0 160 160l0 640q0 160-160 160l-640 0q-160 0-160-160l0-640q0-160 160-160Z" 
        fill="white" 
      />
    </svg>
</template>

<script setup lang="ts">
defineProps<{
  size?: string | number;
}>();
</script>

<style scoped>
.icon {
  display: inline-block;
  vertical-align: middle;
}
</style>
