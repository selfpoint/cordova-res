"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prettyPlatform = exports.isSupportedPlatform = exports.filterSupportedPlatforms = exports.validatePlatforms = exports.resolveSource = exports.imageSourceToPath = exports.generateImageResource = exports.getResourceDestination = exports.generateAdaptiveIconResourcesPortionFromImageSource = exports.generateAdaptiveIconResourcesPortion = exports.consolidateAdaptiveIconResources = exports.generateAdaptiveIconResources = exports.safelyGenerateAdaptiveIconResources = exports.combineTransformFunctions = exports.getResourceTransformFunction = exports.generateSimpleResources = exports.safelyGenerateSimpleResources = exports.run = exports.PLATFORMS = void 0;
const tslib_1 = require("tslib");
const utils_fs_1 = require("@ionic/utils-fs");
const debug_1 = tslib_1.__importDefault(require("debug"));
const path_1 = tslib_1.__importDefault(require("path"));
const error_1 = require("./error");
const image_1 = require("./image");
const resources_1 = require("./resources");
const debug = (0, debug_1.default)('cordova-res:platform');
exports.PLATFORMS = [
    "android" /* Platform.ANDROID */,
    "ios" /* Platform.IOS */,
    "windows" /* Platform.WINDOWS */,
];
/**
 * Run resource generation for the given platform.
 */
async function run(platform, resourcesDirectory, options, operations, errstream) {
    debug('Running %s platform with options: %O', platform, options);
    const resources = [];
    const sources = [];
    const adaptiveResult = await safelyGenerateAdaptiveIconResources(platform, resourcesDirectory, options["adaptive-icon" /* ResourceType.ADAPTIVE_ICON */], operations, errstream);
    if (adaptiveResult && adaptiveResult.resources.length > 0) {
        resources.push(...adaptiveResult.resources);
        sources.push(...adaptiveResult.sources);
    }
    else {
        const iconResult = await generateSimpleResources("icon" /* ResourceType.ICON */, platform, resourcesDirectory, options["icon" /* ResourceType.ICON */], operations, errstream);
        if (iconResult) {
            resources.push(...iconResult.resources);
            sources.push(iconResult.source);
        }
    }
    const splashResult = await generateSimpleResources("splash" /* ResourceType.SPLASH */, platform, resourcesDirectory, options["splash" /* ResourceType.SPLASH */], operations, errstream);
    if (splashResult) {
        resources.push(...splashResult.resources);
        sources.push(splashResult.source);
    }
    return {
        resources,
        sources,
    };
}
exports.run = run;
/**
 * Attempt to generate icons or splash screens for any platform.
 *
 * If there are no options given for this resource or if the source images are
 * not suitable, this function resolves with `undefined`.
 */
async function safelyGenerateSimpleResources(type, platform, resourcesDirectory, options, operations, errstream) {
    if (!options) {
        return;
    }
    try {
        return await generateSimpleResources(type, platform, resourcesDirectory, options, operations, errstream);
    }
    catch (e) {
        debug('Error with %O resources for %O: %O', type, platform, e);
        if (!(e instanceof error_1.ResolveSourceImageError)) {
            throw e;
        }
    }
}
exports.safelyGenerateSimpleResources = safelyGenerateSimpleResources;
/**
 * Generate simple icons or splash screens.
 *
 * Icon and Splash Screen generation is "simple" because there's one source
 * image type and one set of resources to generate.
 *
 * If there are no options given for this resource, this function resolves
 * with `undefined`.
 */
async function generateSimpleResources(type, platform, resourcesDirectory, options, operations, errstream) {
    if (!options) {
        return;
    }
    debug('Building %s resources for %s platform', type, platform);
    const source = await (0, image_1.resolveSourceImage)(platform, type, options.sources.map(s => imageSourceToPath(s)), errstream);
    debug('Using %O for %s source image for %s', source.image.src, type, platform);
    const result = (0, resources_1.getSimpleResources)(platform, type);
    const resources = await Promise.all(result.map(async (resource) => ({
        ...resource,
        ...(await generateImageResource(resourcesDirectory, source.image, { ...resource, fit: operations.fit, position: operations.position }, getResourceTransformFunction(platform, type, operations), errstream)),
    })));
    return {
        resources,
        source,
    };
}
exports.generateSimpleResources = generateSimpleResources;
function getResourceTransformFunction(platform, type, operations) {
    if (typeof operations.transform !== 'function') {
        throw new error_1.BadInputError(`Transform function must be a function or undefined, not "${operations.transform}".`);
    }
    const transforms = [operations.transform];
    const schema = (0, resources_1.getRasterResourceSchema)(platform, type);
    if (!schema.alpha) {
        transforms.push((image, pipeline) => pipeline.flatten({ background: { r: 255, g: 255, b: 255 } }));
    }
    return combineTransformFunctions(transforms);
}
exports.getResourceTransformFunction = getResourceTransformFunction;
function combineTransformFunctions(transformations) {
    return transformations.reduce((acc, transformation) => async (image, pipeline) => {
        const result = await acc(image, pipeline);
        if (!result || typeof result !== 'object') {
            throw new error_1.BadInputError(`Invalid Sharp pipeline returned while performing transforms: ${result}`);
        }
        return transformation(image, result);
    });
}
exports.combineTransformFunctions = combineTransformFunctions;
/**
 * Attempt to generate Adaptive Icons for any platform.
 *
 * If there are no options given for this resource or if the platform or
 * source images are not suitable, this function resolves with `undefined`.
 */
async function safelyGenerateAdaptiveIconResources(platform, resourcesDirectory, options, operations, errstream) {
    if (!options || platform !== "android" /* Platform.ANDROID */) {
        return;
    }
    try {
        return await generateAdaptiveIconResources(resourcesDirectory, options, operations, errstream);
    }
    catch (e) {
        debug('Error with adaptive icons: %O', e);
        if (!(e instanceof error_1.ResolveSourceImageError)) {
            throw e;
        }
    }
}
exports.safelyGenerateAdaptiveIconResources = safelyGenerateAdaptiveIconResources;
/**
 * Generate Android Adaptive Icons.
 */
async function generateAdaptiveIconResources(resourcesDirectory, options, operations, errstream) {
    if (options.foreground.sources.length === 0 ||
        options.background.sources.length === 0) {
        throw new error_1.BadInputError('Adaptive icons require sources for both foreground and background.');
    }
    debug('Building %s resources', "adaptive-icon" /* ResourceType.ADAPTIVE_ICON */);
    const { resources: iconResources = [], source: iconSource } = (await safelyGenerateSimpleResources("icon" /* ResourceType.ICON */, "android" /* Platform.ANDROID */, resourcesDirectory, options.icon, operations, errstream)) || { source: undefined };
    const { resources: foregroundResources, source: foregroundSource } = await generateAdaptiveIconResourcesPortion(resourcesDirectory, "foreground" /* ResourceKey.FOREGROUND */, options.foreground.sources, operations, errstream);
    const resolvedBackgroundSource = await resolveSource("android" /* Platform.ANDROID */, "adaptive-icon" /* ResourceType.ADAPTIVE_ICON */, "background" /* ResourceKey.BACKGROUND */, options.background.sources, errstream);
    const backgroundResources = resolvedBackgroundSource.type === "raster" /* SourceType.RASTER */
        ? await generateAdaptiveIconResourcesPortionFromImageSource(resourcesDirectory, "background" /* ResourceKey.BACKGROUND */, resolvedBackgroundSource, operations, errstream)
        : foregroundResources.map(resource => ({
            ...resource,
            src: '@color/background',
        }));
    const resources = await consolidateAdaptiveIconResources(foregroundResources, backgroundResources);
    return {
        resources: [...iconResources, ...resources],
        sources: [
            ...(iconSource ? [iconSource] : []),
            foregroundSource,
            resolvedBackgroundSource,
        ],
    };
}
exports.generateAdaptiveIconResources = generateAdaptiveIconResources;
async function consolidateAdaptiveIconResources(foregrounds, backgrounds) {
    return foregrounds.map(foreground => {
        const background = backgrounds.find(r => r.density === foreground.density);
        if (!background) {
            throw new error_1.BadInputError(`Cannot consolidate adaptive icon resources: No background for foreground: ${foreground.src}`);
        }
        return {
            platform: "android" /* Platform.ANDROID */,
            type: "adaptive-icon" /* ResourceType.ADAPTIVE_ICON */,
            format: foreground.format,
            foreground: foreground.src,
            background: background.src,
            density: foreground.density,
            width: foreground.width,
            height: foreground.height,
        };
    });
}
exports.consolidateAdaptiveIconResources = consolidateAdaptiveIconResources;
/**
 * Generate the foreground of Adaptive Icons.
 */
async function generateAdaptiveIconResourcesPortion(resourcesDirectory, type, sources, operations, errstream) {
    const source = await (0, image_1.resolveSourceImage)("android" /* Platform.ANDROID */, "adaptive-icon" /* ResourceType.ADAPTIVE_ICON */, sources.map(s => imageSourceToPath(s)), errstream);
    return {
        resources: await generateAdaptiveIconResourcesPortionFromImageSource(resourcesDirectory, type, source, operations, errstream),
        source,
    };
}
exports.generateAdaptiveIconResourcesPortion = generateAdaptiveIconResourcesPortion;
async function generateAdaptiveIconResourcesPortionFromImageSource(resourcesDirectory, type, source, operations, errstream) {
    debug('Using %O for %s source image for %s', source.image.src, "adaptive-icon" /* ResourceType.ADAPTIVE_ICON */, "android" /* Platform.ANDROID */);
    const parts = await Promise.all(resources_1.ANDROID_ADAPTIVE_ICON_RESOURCES.map(async (resource) => ({
        ...resource,
        ...(await generateImageResource(resourcesDirectory, source.image, {
            ...resource,
            src: resource[type],
            fit: operations.fit,
            position: operations.position,
        }, getResourceTransformFunction("android" /* Platform.ANDROID */, "adaptive-icon" /* ResourceType.ADAPTIVE_ICON */, operations), errstream)),
    })));
    return parts;
}
exports.generateAdaptiveIconResourcesPortionFromImageSource = generateAdaptiveIconResourcesPortionFromImageSource;
function getResourceDestination(resourcesDirectory, platform, type, src) {
    return path_1.default.join(resourcesDirectory, platform, type === "adaptive-icon" /* ResourceType.ADAPTIVE_ICON */ ? "icon" /* ResourceType.ICON */ : type, src);
}
exports.getResourceDestination = getResourceDestination;
async function generateImageResource(resourcesDirectory, image, schema, transform = (image, pipeline) => pipeline, errstream) {
    const { pipeline, metadata } = image;
    const { platform, type, src, format, width, height, fit, position } = schema;
    const dest = getResourceDestination(resourcesDirectory, platform, type, src);
    const generatedImage = {
        src: dest,
        format,
        width,
        height,
        fit,
        position,
    };
    await (0, utils_fs_1.ensureDir)(path_1.default.dirname(dest));
    const img = await transform(generatedImage, pipeline.clone());
    await (0, image_1.generateImage)(generatedImage, img, metadata, errstream);
    return {
        format,
        width,
        height,
        src: dest,
    };
}
exports.generateImageResource = generateImageResource;
function imageSourceToPath(source) {
    return typeof source === 'string' ? source : source.src;
}
exports.imageSourceToPath = imageSourceToPath;
async function resolveSource(platform, type, name, sources, errstream) {
    for (const source of sources) {
        if (typeof source === 'string' || source.type === "raster" /* SourceType.RASTER */) {
            const src = imageSourceToPath(source);
            try {
                return await (0, image_1.readSourceImage)(platform, type, src, errstream);
            }
            catch (e) {
                (0, image_1.debugSourceImage)(src, e, errstream);
            }
        }
        else if (source.type === "color" /* SourceType.COLOR */) {
            const color = source.color.toUpperCase();
            if (!color.match(resources_1.COLOR_REGEX)) {
                throw new error_1.BadInputError(`Color ${color} does not match regex ${resources_1.COLOR_REGEX}.`);
            }
            return { platform, resource: type, type: "color" /* SourceType.COLOR */, name, color };
        }
    }
    throw new error_1.BadInputError(`Missing source for "${type}" (sources: ${sources.join(', ')})`);
}
exports.resolveSource = resolveSource;
function validatePlatforms(platforms) {
    const result = [];
    for (const platform of platforms) {
        if (!isSupportedPlatform(platform)) {
            throw new error_1.BadInputError(`Unsupported platform: ${platform}`);
        }
        result.push(platform);
    }
    return result;
}
exports.validatePlatforms = validatePlatforms;
function filterSupportedPlatforms(platforms) {
    return platforms.filter(isSupportedPlatform);
}
exports.filterSupportedPlatforms = filterSupportedPlatforms;
function isSupportedPlatform(platform) {
    return exports.PLATFORMS.includes(platform);
}
exports.isSupportedPlatform = isSupportedPlatform;
function prettyPlatform(platform) {
    switch (platform) {
        case "ios" /* Platform.IOS */:
            return 'iOS';
        case "android" /* Platform.ANDROID */:
            return 'Android';
        case "windows" /* Platform.WINDOWS */:
            return 'Windows';
    }
}
exports.prettyPlatform = prettyPlatform;
