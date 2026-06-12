<template>
  <div class="shell">
    <aside class="sidebar">
      <div class="brand">fin<span>bot</span></div>
      <nav class="nav">
        <NuxtLink to="/">Visão geral</NuxtLink>
        <NuxtLink to="/transactions">Transações</NuxtLink>
        <NuxtLink to="/categories">Categorias</NuxtLink>
        <NuxtLink to="/cards">Cartões</NuxtLink>
        <NuxtLink to="/budgets">Orçamentos</NuxtLink>
        <NuxtLink to="/goals">Metas</NuxtLink>
      </nav>
    </aside>
    <main class="content">
      <slot />
    </main>
  </div>
</template>
