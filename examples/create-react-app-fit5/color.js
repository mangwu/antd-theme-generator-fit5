const path = require("path");
const { generateTheme } = require("../../index");

const options = {
  stylesDir: path.join(__dirname, "./src"), //// all files with .less extension will be processed
  antDir: path.join(__dirname, "./node_modules/antd/"),
  varFile: path.join(__dirname, "./src/styles/variables.less"),
  mainLessFile: path.join(__dirname, "./src/styles/index.less"),
  themeVariables: [
    // 浅色模式公共颜色
    "@gray",
    "@gray-100",
    "@gray-200",
    "@gray-300",
    // "@gray-400",
    "@gray-500",
    "@gray-600",
    "@gray-700",
    "@orange",
    "@light",
    "@global-bg",
    "@light-border-color",
    // 深色模式公共颜色
    "@primary-text-color", // 主字体颜色
    "@secondary-text-color", // 次背景颜色
    "@btn-text-color", // 按钮字体颜色
    "@content-bg", //内容区背景
    "@primary-sidebar-bg", // 侧边导航1
    "@secondary-sidebar-bg", // 侧边导航2
    "@dark-border-color", // 边框色
    // index.less
    "@html-bg",
    "@scrollbar-bg",
    "@g6-bg:",
    "@g6-border",
    "@table-header-batch-bg", // 表格标题样式
    "@global-setting-footer-shadow-color", // 页脚阴影
    "@ant-table-thead-bg", // 表格头
    "@form-tips-color", // form-tips
    "@common-container-scrollbar-color", // 容器滚动条
    "@table-content-status-bg",
    "@table-content-status-color",
    "@column-left-shrink-border",
    "@resize-bar-border",
    "@filter-item-bg",
    // layout 整体布局
    "@header-bg", // 页眉背景颜色
    "@header-font-color", // 页眉标题
    "@font-text-color", // 部分文本字体颜色，如标题，数字等
    "@font-light-color", // 部分文本字体颜色，如label等
    "@font-normal-color", // 大部分普通文本颜色，如content等
    "@font-dark-color", // 部分菜单颜色，@gray变为主文本颜色 #434850 => #BDC2D4
    "@font-svg-color",
    "@font-change-color", // 由主色（primary-color）变为主文本颜色的字体
    "@font-btn-color", // 由主色变为白色的按钮字体
    "@siderbar-change-bg", // 由白色变为主背景颜色的侧边栏
    "@border-right-color", // 侧边栏一右侧边框色
    "@border-input-color", // 侧边栏二上方input
    "@menu-secondary-select-bg", // 侧边栏二被选中项目颜色
    "@btn-bg",
    "@menu-bg",
    "@popover-bg", // 弹出框
    "@menu-secondary-bg", // 侧边栏二
    "@delete-color",
    "@disable-color",
    "@header-font-select-color", // 页眉被选中标题
    "@dark-border-color-map-light-border-color", // 由深色模式下的边框色到白色的映射
    "@dark-bottom-color-map-light-bottom-color", // 菜单栏未被选中的底边颜色
    // antd样式
    "@link-color",
    "@link-hover-color", // 链接色 hover颜色
    "@border-color-base",
    "@primary-color",
    "@secondary-color",
    "@text-color",
    "@text-color-secondary",
    "@heading-color",
    "@layout-body-background",
    "@layout-header-background",
    "@border-radius-base",
    "@tooltip-color", // tooltip文本颜色
    "@tooltip-bg", // tooltip背景颜色
    // "@component-background", // 组件背景
    "@dropdown-menu-bg", // 下拉菜单背景颜色
    "@border-color-split", // 内部边框色
    "@dropdown-selected-color", // 下拉菜单被选中颜色
    "@input-bg", // 输入框背景颜色
    // 表格颜色
    "@th-bg-color",
    "@row-hover-color",
    // reset.less
    "@reset-ant-menu-item-selected-bg",
    "@ant-dropdown-menu-item-active-bg",
    "@light-dropdown-map-dark-dropdown", // 下拉背景颜色

    // 各个组件细节处理
    // CardTitle.less
    "@sub-title-color",
    // ModuleIntroduce 组件
    "@module-info-bg",
    "@link-change-color",
    // Dashboard组件
    "@hello-text-color", // .hello-text 文本
    // Stage组件
    "@shrink-color", // .shrink-color
    "@switcher-color", // .tree-switcher-color
    "@tree-hover-color",
  ],
  outputFilePath: path.join(__dirname, "./public/color.less"),
  useAntdLess: false,
};

generateTheme(options)
  .then((less) => {
    console.log("Theme generated successfully");
  })
  .catch((error) => {
    console.log("Error", error);
  });
