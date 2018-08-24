var gulp = require('gulp');
var uglify = require('gulp-uglify');
var pump = require('pump');
const babel = require('gulp-babel');

gulp.task('default', ['build', 'copy']);

gulp.task('copy', function (cb) {
    pump([
            gulp.src(['src/**/*', '!src/**/*.js']),
            gulp.dest('build')
        ],
        cb
    );
});

gulp.task('build', function (cb) {
    pump([
            gulp.src(['src/**/*.js', '!src/encoders/*.js']),
            babel({
                "presets": ["env"]
            }),
            uglify(),
            gulp.dest('build')
        ],
        cb
    );
});