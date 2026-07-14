<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useProgramStore, FAMOUS_PROGRAMS } from '../stores/program'
import AppModal from '../components/AppModal.vue'
import BackButton from '../components/BackButton.vue'

const router = useRouter()
const programStore = useProgramStore()

function selectTemplate(template) {
  programStore.initDraftFromTemplate(template)
  router.push('/builder/new')
}

const showModal = ref(false)

function createCustom() {
  showModal.value = true
}

function handleCustomProgram(name) {
  if (name) {
    programStore.initDraftCustom(name.trim() || "Custom Program")
    router.push('/builder/new')
  }
}
</script>

<template>
  <div class="create-program">
    <!-- Header with Back Button -->
    <div class="flex-row mb-24 gap-12" style="align-items: center;">
      <BackButton />
      <h1 class="title m-0">Create Program</h1>
    </div>

    <!-- Description -->
    <div class="section-container mb-24">
      <p class="section-desc" style="margin-top: 0; margin-bottom: 0;">
        Choose a pre-made routine template to get started immediately, or create a custom workout program designed entirely by you.
      </p>
    </div>

    <!-- Templates Grid Section -->
    <div class="section-container">
      <TransitionGroup name="list-fade" tag="div" class="templates-grid">
        <!-- Custom Program Card (Dashed Primary CTA) -->
        <div key="custom-program" class="template-card custom-card tap-target" @click="createCustom" style="min-height: 190px;">
          <div class="template-icon-circle mb-16">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </div>
          <h3 class="template-name" style="font-weight: 700; margin-bottom: 6px;">Custom Program</h3>
          <p class="template-desc" style="margin-bottom: 0;">Build your own program day-by-day from scratch.</p>
        </div>

        <!-- Famous Routine Templates -->
        <div 
          v-for="tpl in FAMOUS_PROGRAMS"
          :key="tpl.id" 
          class="template-card tap-target tpl-card" 
          @click="selectTemplate(tpl)"
          style="min-height: 190px;"
        >
          <div class="tpl-card-header mb-12">
            <h3 class="template-name m-0" style="font-weight: 700;">{{ tpl.name }}</h3>
            <span class="tpl-badge">{{ tpl.days.length }} Days</span>
          </div>
          <p class="template-desc mb-16" style="flex-grow: 1;">{{ tpl.description }}</p>
          <div class="template-days-tags">
            <span v-for="d in tpl.days.slice(0, 3)" :key="d" class="day-tag">{{ d }}</span>
            <span v-if="tpl.days.length > 3" class="day-tag">+{{ tpl.days.length - 3 }} More</span>
          </div>
        </div>
      </TransitionGroup>
    </div>

    <!-- Custom Program Modal -->
    <AppModal 
      v-model:show="showModal" 
      title="Custom Program" 
      message="Enter a name for your custom program:" 
      type="prompt" 
      default-value="My Custom Program" 
      confirm-text="Create" 
      @confirm="handleCustomProgram" 
    />
  </div>
</template>

<style scoped>
.template-icon-circle {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: 1px dashed var(--text-secondary);
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.25s ease;
}

.custom-card:hover .template-icon-circle {
  border-color: var(--primary-accent);
  color: var(--primary-accent);
  background-color: rgba(204, 255, 0, 0.05);
}

.tpl-card {
  position: relative;
  overflow: hidden;
  justify-content: space-between;
}

.tpl-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  width: 100%;
}

.tpl-badge {
  background-color: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 6px;
  text-transform: uppercase;
}

.tpl-card:hover .tpl-badge {
  border-color: var(--primary-accent);
  color: var(--primary-accent);
  background-color: rgba(204, 255, 0, 0.03);
}

.day-tag {
  background-color: rgba(0, 0, 0, 0.2);
  border: 1px solid var(--border-color);
}
</style>
