module.exports = function (grunt) {
	require('grunt-dojo2').initConfig(grunt, {
		/* any custom configuration goes here */
		copy: {
			staticExampleFiles: {
				expand: true,
				cwd: '.',
				src: ['examples/**/*.html'],
				dest: '<%= devDirectory %>'
			}
		},
	});

	// Re-register the dev task so it includes copy:staticExampleFiles
	const devTasks = grunt.config.get('devTasks');
	devTasks.push('copy:staticExampleFiles');
	grunt.registerTask('dev', devTasks);
};
