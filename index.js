const fs = require("fs");
const path = require("path");
const glob = require("glob");
const postcss = require("postcss");
const less = require("less");
const hash = require("hash.js");
const bundle = require("less-bundle-promise");
const NpmImportPlugin = require("less-plugin-npm-import");
const stripCssComments = require("strip-css-comments");
const { copyDir } = require("./filecopy");

let hashCache = "";
let cssCache = "";

const COLOR_FUNCTIONS = [
  "color",
  "lighten",
  "darken",
  "saturate",
  "desaturate",
  "fadein",
  "fadeout",
  "fade",
  "spin",
  "mix",
  "hsv",
  "tint",
  "shade",
  "greyscale",
  "multiply",
  "contrast",
  "screen",
  "overlay",
];

const defaultColorRegexArray = COLOR_FUNCTIONS.map(
  (name) => new RegExp(`${name}\(.*\)`)
);
defaultColorRegexArray.matches = (color) => {
  return defaultColorRegexArray.reduce((prev, regex) => {
    return prev || regex.test(color);
  }, false);
};

/*
  Generated random hex color code
  e.g. #fe12ee
*/
function randomColor() {
  return "#" + (0x1000000 + Math.random() * 0xffffff).toString(16).substr(1, 6);
}

/*
  Recursively get the color code assigned to a variable e.g.
  @primary-color: #1890ff;
  @link-color: @primary-color;

  @link-color -> @primary-color ->  #1890ff
  Which means
  @link-color: #1890ff
*/
function getColor(varName, mappings) {
  const color = mappings[varName];
  if (color in mappings) {
    return getColor(color, mappings);
  } else {
    return color;
  }
}
/*
  Read following files and generate color variables and color codes mapping
    - Ant design color.less, themes/default.less
    - Your own variables.less
  It will generate map like this
  {
    '@primary-color': '#00375B',
    '@info-color': '#1890ff',
    '@success-color': '#52c41a',
    '@error-color': '#f5222d',
    '@normal-color': '#d9d9d9',
    '@primary-6': '#1890ff',
    '@heading-color': '#fa8c16',
    '@text-color': '#cccccc',
    ....
  }
*/
function generateColorMap(content, customColorRegexArray = []) {
  return content
    .split("\n")
    .filter((line) => line.startsWith("@") && line.indexOf(":") > -1)
    .reduce((prev, next) => {
      try {
        const matches = next.match(
          /(?=\S*['-])([@a-zA-Z0-9'-]+).*:[ ]{1,}(.*);/
        );
        if (!matches) {
          return prev;
        }
        let [, varName, color] = matches;
        if (color && color.startsWith("@")) {
          color = getColor(color, prev);
          if (!isValidColor(color, customColorRegexArray)) return prev;
          // if (defaultColorRegexArray.matches(color) && !color.includes('~')) {
          //   color = `~'${color}'`;
          // }
          prev[varName] = color;
        } else if (isValidColor(color, customColorRegexArray)) {
          // if (defaultColorRegexArray.matches(color) && !color.includes('~')) {
          //   color = `~'${color}'`;
          // }
          prev[varName] = color;
        }
        return prev;
      } catch (e) {
        console.log("e", e);
        return prev;
      }
    }, {});
}

/*
 This plugin will remove all css rules except those are related to colors
 e.g.
 Input:
 .body {
    font-family: 'Lato';
    background: #cccccc;
    color: #000;
    padding: 0;
    pargin: 0
 }

 Output:
  .body {
    background: #cccccc;
    color: #000;
 }
*/
const reducePlugin = postcss.plugin("reducePlugin", () => {
  const cleanRule = (rule) => {
    if (rule.selector.startsWith(".main-color .palatte-")) {
      rule.remove();
      return;
    }

    let removeRule = true;
    rule.walkDecls((decl) => {
      let matched = false;
      if (String(decl.value).match(/url\(.*\)/g)) {
        decl.remove();
        matched = true;
      }

      // Removing transparent adds Link Button border color
      // https://github.com/mzohaibqc/antd-theme-generator/issues/64
      // if (!matched && decl.value === 'transparent') {
      //   decl.remove();
      //   matched = true;
      // }
      /*
      this block causing https://github.com/ant-design/ant-design/issues/24777
      if (decl.prop !== 'background' && decl.prop.includes('background') && !decl.prop.match(/^background-(.*)color$/ig)) {
        decl.remove();
        matched = true;
      }
      if (decl.prop !== 'border' && decl.prop.includes('border') && !decl.prop.match(/^border-(.*)color$/ig)) {
        decl.remove();
        matched = true;
      }
      if (['transparent', 'inherit', 'none', '0'].includes(decl.value)) {
        decl.remove();
        matched = true;
      }
      */
      if (
        !decl.prop.includes("color") &&
        !decl.prop.includes("background") &&
        !decl.prop.includes("border") &&
        !decl.prop.includes("box-shadow") &&
        !decl.prop.includes("stroke") &&
        !decl.prop.includes("fill") &&
        !Number.isNaN(decl.value)
      ) {
        // if (!matched) decl.remove();
        decl.remove();
      } else {
        removeRule = matched ? removeRule : false;
      }
    });
    if (removeRule) {
      rule.remove();
    }
  };
  return (css) => {
    css.walkAtRules((atRule) => {
      atRule.remove();
    });

    css.walkRules(cleanRule);

    css.walkComments((c) => c.remove());
  };
});

function getMatches(string, regex) {
  const matches = {};
  let match;
  while ((match = regex.exec(string))) {
    if (match[2].startsWith("rgba") || match[2].startsWith("#")) {
      matches[`@${match[1]}`] = match[2];
    }
  }
  return matches;
}

/*
  This function takes less input as string and compiles into css.
*/
function render(text, paths) {
  return less.render(text, {
    paths: paths,
    javascriptEnabled: true,
    plugins: [new NpmImportPlugin({ prefix: "~" })],
  });
}

/*
  This funtion reads a less file and create an object with keys as variable names
  and values as variables respective values. e.g.
  //variabables.less
    @primary-color : #1890ff;
    @heading-color : #fa8c16;
    @text-color : #cccccc;

    to

    {
      '@primary-color' : '#1890ff',
      '@heading-color' : '#fa8c16',
      '@text-color' : '#cccccc'
    }

*/
function getLessVars(filtPath) {
  const sheet = fs.readFileSync(filtPath).toString();
  const lessVars = {};
  const matches = sheet.match(/@(.*:[^;]*)/g) || [];

  matches.forEach((variable) => {
    const definition = variable.split(/:\s*/);
    const varName = definition[0].replace(/['"]+/g, "").trim();
    lessVars[varName] = definition.splice(1).join(":");
  });
  return lessVars;
}

/*
  This function take primary color palette name and returns @primary-color dependent value
  .e.g
  Input: @primary-1
  Output: color(~`colorPalette("@{primary-color}", ' 1 ')`)
*/
function getShade(varName) {
  let [, className, number] = varName.match(/(.*)-(\d)/);
  if (/primary-\d/.test(varName)) className = "@primary-color";
  return (
    'color(~`colorPalette("@{' +
    className.replace("@", "") +
    '}", ' +
    number +
    ")`)"
  );
}

/*
  This function takes color string as input and return true if string is a valid color otherwise returns false.
  e.g.
  isValidColor('#ffffff'); //true
  isValidColor('#fff'); //true
  isValidColor('rgba(0, 0, 0, 0.5)'); //true
  isValidColor('20px'); //false
*/
function isValidColor(color, customColorRegexArray = []) {
  if (color && color.includes("rgb")) return true;
  if (!color || color.match(/px/g)) return false;
  if (color.match(/colorPalette|fade/g)) return true;
  if (color.charAt(0) === "#") {
    color = color.substring(1);
    return (
      [3, 4, 6, 8].indexOf(color.length) > -1 && !isNaN(parseInt(color, 16))
    );
  }
  // eslint-disable-next-line
  const isColor =
    /^(rgb|hsl|hsv)a?\((\d+%?(deg|rad|grad|turn)?[,\s]+){2,3}[\s\/]*[\d\.]+%?\)$/i.test(
      color
    );
  if (isColor) return true;
  if (customColorRegexArray.length > 0) {
    return customColorRegexArray.reduce((prev, regex) => {
      return prev || regex.test(color);
    }, false);
  }
  return false;
}

async function compileAllLessFilesToCss(
  stylesDir,
  antdStylesDir,
  varMap = {},
  varPath
) {
  /*
    Get all less files path in styles directory
    and then compile all to css and join
  */
  const stylesDirs = [].concat(stylesDir);
  let styles = [];
  stylesDirs.forEach((s) => {
    styles = styles.concat(glob.sync(path.join(s, "./**/*.less")));
  });
  const csss = await Promise.all(
    styles.map((filePath) => {
      let fileContent = fs.readFileSync(filePath).toString();
      // Removed imports to avoid duplicate styles due to reading file separately as well as part of parent file (which is importing)
      // if (avoidDuplicates) fileContent = fileContent.replace(/@import\ ["'](.*)["'];/g, '\n');
      const r = /@import ["'](.*)["'];/g;
      const directory = path.dirname(filePath);
      fileContent = fileContent.replace(
        r,
        function (match, importPath, index, content) {
          if (!importPath.endsWith(".less")) {
            importPath += ".less";
          }
          const newPath = path.join(directory, importPath);
          // If imported path/file already exists in styles paths then replace import statement with empty line
          if (styles.indexOf(newPath) === -1) {
            return match;
          } else {
            return "";
          }
        }
      );
      Object.keys(varMap).forEach((varName) => {
        fileContent = fileContent.replace(
          new RegExp(`(:.*)(${varName})`, "g"),
          (match, group, a) => {
            return match.replace(varName, varMap[varName]);
          }
        );
      });
      fileContent = `@import "${varPath}";\n${fileContent}`;
      // fileContent = `@import "~antd/lib/style/themes/default.less";\n${fileContent}`;
      return less
        .render(fileContent, {
          paths: [antdStylesDir].concat(stylesDir),
          filename: path.resolve(filePath),
          javascriptEnabled: true,
          plugins: [new NpmImportPlugin({ prefix: "~" })],
        })
        .then((res) => {
          return res;
        })
        .catch((e) => {
          console.error(`Error occurred compiling file ${filePath}`);
          console.error("Error", e);
          return "\n";
        });
    })
  );
  const hashes = {};

  return csss
    .map((c) => {
      const css = stripCssComments(c.css || "", { preserve: false });
      const hashCode = hash.sha256().update(css).digest("hex");
      if (hashCode in hashes) {
        return "";
      } else {
        hashes[hashCode] = hashCode;
        return css;
      }
    })
    .join("\n");
}

/**
 * @description This is main function which call all other functions to generate color.less file which contins all color
  related css rules based on Ant Design styles and your own custom styles
  By default color.less will be generated in /public directory
 * @param {object} {
    antDir, // antd包地址;
    antdStylesDir, // antd主样式文件地址;
    stylesDir, // 所有需要生成主题的样式;
    varFile, // 颜色变量文件;
    outputFilePath, // 输出的colors路径;
    themeVariables = ["@primary-color"], // 主题颜色变量;
    customColorRegexArray = [], // ;
    useAntdLess = true, // 是否需要合入antd的Less文件，
    // 因为antd@5不再支持less，所以5版本应该填入false;
  }
 * @returns 
 */
async function generateTheme({
  antDir,
  antdStylesDir,
  stylesDir,
  varFile,
  outputFilePath,
  themeVariables = ["@primary-color"],
  customColorRegexArray = [],
  useAntdLess = true,
}) {
  try {
    const antdPath = antdStylesDir || path.join(antDir, "lib");
    const nodeModulesPath = path.join(
      antDir.slice(0, antDir.indexOf("node_modules")),
      "./node_modules"
    );
    /*
      stylesDir can be array or string
    */
    const stylesDirs = [].concat(stylesDir);
    let styles = [];
    stylesDirs.forEach((s) => {
      styles = styles.concat(glob.sync(path.join(s, "./**/*.less")));
    });

    const antdStylesFile = path.join(antDir, "./dist/antd.less"); // path.join(antdPath, './style/index.less');

    /*
      You own custom styles (Change according to your project structure)

      - stylesDir - styles directory containing all less files
      - varFile - variable file containing ant design specific and your own custom variables
    */
    varFile = varFile || path.join(antdPath, "./style/themes/default.less");

    let content = "";
    styles.forEach((filePath) => {
      content += fs.readFileSync(filePath).toString();
    });

    const hashCode = hash.sha256().update(content).digest("hex");
    if (hashCode === hashCache) {
      return cssCache;
    }
    hashCache = hashCode;
    let themeCompiledVars = {};
    let themeVars = themeVariables || ["@primary-color"];
    const lessPaths = [path.join(antdPath, "./style")].concat(stylesDir);

    const randomColors = {};
    const randomColorsVars = {};
    /*
    Ant Design Specific Files (Change according to your project structure)
    You can even use different less based css framework and create color.less for  that

    - antDir - ant design instalation path
    - entry - Ant Design less main file / entry file
    - styles - Ant Design less styles for each component

    1. Bundle all variables into one file
    2. process vars and create a color name, color value key value map
    3. Get variables which are part of theme
    4.
  */

    const varFileContent = combineLess(varFile, nodeModulesPath);
    let antdLess = "";
    if (useAntdLess) {
      antdLess = await bundle({
        src: antdStylesFile,
      });
    }
    customColorRegexArray = [
      ...customColorRegexArray,
      ...defaultColorRegexArray,
    ];
    const mappings = Object.assign(
      generateColorMap(varFileContent, customColorRegexArray),
      getLessVars(varFile)
    );

    let css = "";
    const PRIMARY_RANDOM_COLOR = "#123456";
    themeVars = themeVars.filter(
      (name) => name in mappings && !name.match(/(.*)-(\d)/)
    );
    themeVars.forEach((varName) => {
      let color = randomColor();
      if (varName === "@primary-color") {
        color = PRIMARY_RANDOM_COLOR;
      } else {
        while (
          (randomColorsVars[color] && color === PRIMARY_RANDOM_COLOR) ||
          color === "#000000" ||
          color === "#ffffff"
        ) {
          color = randomColor();
        }
      }
      randomColors[varName] = color;
      randomColorsVars[color] = varName;
      css = `.${varName.replace("@", "")} { color: ${color}; }\n ${css}`;
    });
    const colorFuncMap = {};
    let varsContent = "";
    themeVars.forEach((varName) => {
      [1, 2, 3, 4, 5, 7, 8, 9, 10].forEach((key) => {
        const name =
          varName === "@primary-color"
            ? `@primary-${key}`
            : `${varName}-${key}`;
        css = `.${name.replace("@", "")} { color: ${getShade(
          name
        )}; }\n ${css}`;
      });
      varsContent += `${varName}: ${randomColors[varName]};\n`;
    });

    // This is to compile colors
    // Put colors.less content first,
    // then add random color variables to override the variables values for given theme variables with random colors
    // Then add css containinf color variable classes
    const colorFileContent = combineLess(
      path.join(__dirname, "./color/colors.less"),
      __dirname
    );
    css = `${colorFileContent}${varsContent}\n${css}`;
    let results = await render(css, lessPaths);
    css = results.css;
    css = css.replace(/(\/.*\/)/g, "");
    const regex = /.(?=\S*['-])([.a-zA-Z0-9'-]+)\ {\n {2}color: (.*);/g;
    themeCompiledVars = getMatches(css, regex);
    // Convert all custom user less files to css
    const userCustomCss = await compileAllLessFilesToCss(
      stylesDir,
      antdStylesDir,
      themeCompiledVars,
      varFile
    );
    let fadeMap = {};
    const fades = antdLess.match(/fade\(.*\)/g);
    if (fades) {
      fades.forEach((fade) => {
        if (
          !fade.startsWith("fade(@black") &&
          !fade.startsWith("fade(@white") &&
          !fade.startsWith("fade(#") &&
          !fade.startsWith("fade(@color")
        ) {
          fadeMap[fade] = randomColor();
        }
      });
    }
    let varsCombined = "";
    themeVars.forEach((varName) => {
      let color;
      if (/(.*)-(\d)/.test(varName)) {
        color = getShade(varName);
        return;
      } else {
        color = themeCompiledVars[varName];
      }
      varsCombined = `${varsCombined}\n${varName}: ${color};`;
    });
    COLOR_FUNCTIONS.slice(1).forEach((name) => {
      antdLess = antdLess.replace(
        new RegExp(`${name}\\((.*), \\d+%\\)`, "g"),
        (fullmatch, group) => {
          if (mappings[group]) {
            return `~'${fullmatch}'`;
          }
          return fullmatch;
        }
      );
    });
    if (useAntdLess) {
      antdLess = `${antdLess}\n${varsCombined}`;
    } else {
      antdLess = `${varsCombined}`;
    }
    const { css: antCss } = await render(antdLess, [antdPath, antdStylesDir]);
    const allCss = `${antCss}\n${userCustomCss}`;
    results = await postcss([reducePlugin]).process(allCss, {
      from: antdStylesFile,
    });
    css = results.css;

    Object.keys(fadeMap).forEach((fade) => {
      css = css.replace(new RegExp(fadeMap[fade], "g"), fade);
    });

    Object.keys(themeCompiledVars).forEach((varName) => {
      let color;
      if (/(.*)-(\d)/.test(varName)) {
        color = themeCompiledVars[varName];
        varName = getShade(varName);
      } else {
        color = themeCompiledVars[varName];
      }
      color = color.replace("(", "\\(").replace(")", "\\)");
      if (varName === "@slider-handle-color-focus") {
        console.log("color", color, varName);
      }
      css = css.replace(new RegExp(color, "g"), varName);
    });

    Object.keys(colorFuncMap).forEach((varName) => {
      const color = colorFuncMap[varName];
      css = css.replace(new RegExp(color, "g"), varName);
    });
    COLOR_FUNCTIONS.forEach((name) => {
      css = css.replace(new RegExp(`~'(${name}\(.*\))'`), (a, b) => {
        console.log("b", b);
        return b;
      });
    });
    // Handle special cases
    // https://github.com/mzohaibqc/antd-theme-webpack-plugin/issues/69
    // 1. Replace fade(@primary-color, 20%) value i.e. rgba(18, 52, 86, 0.2)
    css = css.replace(
      new RegExp("rgba\\(18, 52, 86, 0.2\\)", "g"),
      "fade(@primary-color, 20%)"
    );

    css = css.replace(/@[\w-_]+:\s*.*;[\/.]*/gm, "");

    // This is to replace \9 in Ant Design styles
    css = css.replace(/\\9/g, "");
    if (useAntdLess) {
      css = `${css.trim()}\n${combineLess(
        path.join(antdPath, "./style/themes/default.less"),
        nodeModulesPath
      )}`;
    } else {
      css = `${css.trim()}`;
    }

    themeVars.reverse().forEach((varName) => {
      css = css.replace(new RegExp(`${varName}( *):(.*);`, "g"), "");
      css = `${varName}: ${mappings[varName]};\n${css}\n`;
    });

    css = minifyCss(css);

    // 复制color到输出路径
    const outputColorFilePath =
      outputFilePath.slice(0, outputFilePath.lastIndexOf("color.less")) +
      "color";
    copyDir(path.join(__dirname, "./color"), outputColorFilePath, (err) => {
      console.log("color文件夹复制有误", err);
    });

    if (outputFilePath) {
      fs.writeFileSync(
        outputFilePath,
        `@import "./color/colorPalette.less";\n${css}`
      );
      console.log(
        `🌈 Theme generated successfully. OutputFile: ${outputFilePath}`
      );
    } else {
      console.log("❓ Theme generated successfully, but invalid output address!");
    }
    cssCache = css;
    return cssCache;
  } catch (error) {
    console.log("error", error);
    return "";
  }
}

module.exports = {
  generateTheme,
  isValidColor,
  getLessVars,
  randomColor,
  minifyCss,
  renderLessContent: render,
};

function minifyCss(css) {
  // Removed all comments and empty lines
  css = css
    .replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "")
    .replace(/^\s*$(?:\r\n?|\n)/gm, "");

  /*
  Converts from

    .abc,
    .def {
      color: red;
      background: blue;
      border: grey;
    }

    to

    .abc,
    .def {color: red;
      background: blue;
      border: grey;
    }

  */
  css = css.replace(/\{(\r\n?|\n)\s+/g, "{");

  /*
  Converts from

  .abc,
  .def {color: red;
  }

  to

  .abc,
  .def {color: red;
    background: blue;
    border: grey;}

  */
  css = css.replace(/;(\r\n?|\n)\}/g, ";}");

  /*
  Converts from

  .abc,
  .def {color: red;
    background: blue;
    border: grey;}

  to

  .abc,
  .def {color: red;background: blue;border: grey;}

  */
  css = css.replace(/;(\r\n?|\n)\s+/g, ";");

  /*
Converts from

.abc,
.def {color: red;background: blue;border: grey;}

to

.abc, .def {color: red;background: blue;border: grey;}

*/
  css = css.replace(/,(\r\n?|\n)[.]/g, ", .");
  return css;
}

// const removeColorCodesPlugin = postcss.plugin('removeColorCodesPlugin', () => {
//   const cleanRule = rule => {
//     let removeRule = true;
//     rule.walkDecls(decl => {
//       if (
//         !decl.value.includes('@')
//       ) {
//         decl.remove();
//       } else {
//         removeRule = false;
//       }
//     });
//     if (removeRule) {
//       rule.remove();
//     }
//   };
//   return css => {
//     css.walkRules(cleanRule);
//   };
// });

function combineLess(filePath, nodeModulesPath) {
  const fileContent = fs.readFileSync(filePath).toString();
  const directory = path.dirname(filePath);
  return fileContent
    .split("\n")
    .map((line) => {
      if (line.startsWith("@import")) {
        let importPath = line.match(/@import[^'"]*['"](.*)['"]/)[1];
        if (!importPath.endsWith(".less")) {
          importPath += ".less";
        }
        let newPath = path.join(directory, importPath);
        if (importPath.startsWith("~")) {
          importPath = importPath.replace("~", "");
          newPath = path.join(nodeModulesPath, `./${importPath}`);
        }
        return combineLess(newPath, nodeModulesPath);
      }
      return line;
    })
    .join("\n");
}
