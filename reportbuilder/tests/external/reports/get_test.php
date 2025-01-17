<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Moodle is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not, see <http://www.gnu.org/licenses/>.

declare(strict_types=1);

namespace core_reportbuilder\external\reports;

use context_system;
use core_reportbuilder_generator;
use external_api;
use externallib_advanced_testcase;
use core_reportbuilder\report_access_exception;
use core_user\reportbuilder\datasource\users;

defined('MOODLE_INTERNAL') || die();

global $CFG;
require_once("{$CFG->dirroot}/webservice/tests/helpers.php");

/**
 * Unit tests of external class for getting reports
 *
 * @package     core_reportbuilder
 * @covers      \core_reportbuilder\external\reports\get
 * @copyright   2021 David Matamoros <davidmc@moodle.com>
 * @license     http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class get_test extends externallib_advanced_testcase {

    /**
     * Text execute method for edit mode
     */
    public function test_execute_editmode(): void {
        $this->resetAfterTest();
        $this->setAdminUser();

        /** @var core_reportbuilder_generator $generator */
        $generator = $this->getDataGenerator()->get_plugin_generator('core_reportbuilder');

        $report = $generator->create_report([
            'name' => 'My report',
            'source' => users::class,
            'default' => false,
        ]);

        $result = get::execute($report->get('id'), true);
        $result = external_api::clean_returnvalue(get::execute_returns(), $result);

        $this->assertEquals($result['id'], $report->get('id'));
        $this->assertEquals($result['name'], 'My report');
        $this->assertEquals($result['source'], users::class);
        $this->assertNotEmpty($result['table']);
        $this->assertNotEmpty($result['javascript']);
        $this->assertEmpty($result['filtersform']);
        $this->assertEquals(1, $result['editmode']);
        $this->assertTrue($result['showeditbutton']);
        $this->assertTrue($result['filters']['hasavailablefilters']);
        $this->assertNotEmpty($result['filters']['availablefilters']);
        $this->assertFalse($result['filters']['hasactivefilters']);
        $this->assertEmpty($result['filters']['activefilters']);
    }

    /**
     * Text execute method for preview mode
     */
    public function test_execute_previewmode(): void {
        $this->resetAfterTest();
        $this->setAdminUser();

        /** @var core_reportbuilder_generator $generator */
        $generator = $this->getDataGenerator()->get_plugin_generator('core_reportbuilder');

        $report = $generator->create_report([
            'name' => 'My report',
            'source' => users::class,
            'default' => false,
        ]);

        // Add two filters.
        $filterfullname = $generator->create_filter(['reportid' => $report->get('id'), 'uniqueidentifier' => 'user:fullname']);
        $filteremail = $generator->create_filter(['reportid' => $report->get('id'), 'uniqueidentifier' => 'user:email']);

        $result = get::execute($report->get('id'), false);
        $result = external_api::clean_returnvalue(get::execute_returns(), $result);

        $this->assertEquals($result['id'], $report->get('id'));
        $this->assertEquals($result['name'], 'My report');
        $this->assertEquals($result['source'], users::class);
        $this->assertNotEmpty($result['table']);
        $this->assertNotEmpty($result['javascript']);
        $this->assertNotEmpty($result['filtersform']);
        $this->assertEquals(0, $result['editmode']);
        $this->assertTrue($result['showeditbutton']);
        $this->assertTrue($result['filters']['hasavailablefilters']);
        $this->assertNotEmpty($result['filters']['availablefilters']);
        $this->assertTrue($result['filters']['hasactivefilters']);
        $this->assertEquals($filterfullname->get('id'), $result['filters']['activefilters'][0]['id']);
        $this->assertEquals($filteremail->get('id'), $result['filters']['activefilters'][1]['id']);
    }

    /**
     * Test execute method for a user without permission to edit reports
     */
    public function test_execute_access_exception(): void {
        $this->resetAfterTest();

        /** @var core_reportbuilder_generator $generator */
        $generator = $this->getDataGenerator()->get_plugin_generator('core_reportbuilder');
        $report = $generator->create_report(['name' => 'My report', 'source' => users::class]);

        $user = $this->getDataGenerator()->create_user();
        $this->setUser($user);

        $this->expectException(report_access_exception::class);
        $this->expectExceptionMessage('You can not edit this report');
        get::execute($report->get('id'), true);
    }

    /**
     * Test execute method for a user without permission to view reports
     */
    public function test_execute_view_access_exception(): void {
        $this->resetAfterTest();

        /** @var core_reportbuilder_generator $generator */
        $generator = $this->getDataGenerator()->get_plugin_generator('core_reportbuilder');
        $report = $generator->create_report(['name' => 'My report', 'source' => users::class]);

        $user = $this->getDataGenerator()->create_user();
        $contextid = context_system::instance()->id;
        $roleid = create_role('Dummy role', 'dummyrole', 'dummy role description');
        assign_capability('moodle/reportbuilder:view', CAP_PROHIBIT, $roleid, $contextid);
        role_assign($roleid, $user->id, $contextid);

        $this->setUser($user);

        $this->expectException(report_access_exception::class);
        $this->expectExceptionMessage('You can not view this report');
        get::execute($report->get('id'), false);
    }
}
