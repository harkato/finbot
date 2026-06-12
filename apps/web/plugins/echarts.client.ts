import { BarChart, LineChart, PieChart } from "echarts/charts";
import {
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
} from "echarts/components";
import { use } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import VChart from "vue-echarts";

export default defineNuxtPlugin((nuxtApp) => {
  use([
    CanvasRenderer,
    PieChart,
    LineChart,
    BarChart,
    TooltipComponent,
    LegendComponent,
    GridComponent,
    TitleComponent,
  ]);
  nuxtApp.vueApp.component("VChart", VChart);
});
