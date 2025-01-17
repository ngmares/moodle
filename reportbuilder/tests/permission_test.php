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

namespace core_reportbuilder;

use advanced_testcase;
use context_system;
use core_reportbuilder_generator;
use Throwable;
use core_user\reportbuilder\datasource\users;

/**
 * Unit tests for the report permission class
 *
 * @package     core_reportbuilder
 * @covers      \core_reportbuilder\permission
 * @copyright   2021 Paul Holden <paulh@moodle.com>
 * @license     http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class permission_test extends advanced_testcase {

    /**
     * Test whether user can view reports list
     */
    public function test_require_can_view_reports_list(): void {
        global $DB;

        $this->resetAfterTest();

        // User with permission.
        $this->setAdminUser();
        try {
            permission::require_can_view_reports_list();
        } catch (Throwable $exception) {
            $this->fail($exception->getMessage());
        }

        // User without permission.
        $user = $this->getDataGenerator()->create_user();
        $this->setUser($user);

        $userrole = $DB->get_field('role', 'id', ['shortname' => 'user']);
        unassign_capability('moodle/reportbuilder:view', $userrole, context_system::instance());

        $this->expectException(report_access_exception::class);
        $this->expectExceptionMessage('You can not view this report');
        permission::require_can_view_reports_list();
    }

    /**
     * Test whether user can view specific report
     *
     * TODO: audiences
     */
    public function test_require_can_view_report(): void {
        global $DB;

        $this->resetAfterTest();

        /** @var core_reportbuilder_generator $generator */
        $generator = $this->getDataGenerator()->get_plugin_generator('core_reportbuilder');
        $report = $generator->create_report(['name' => 'My report', 'source' => users::class]);

        // User with permission.
        $this->setAdminUser();
        try {
            permission::require_can_view_report($report);
        } catch (Throwable $exception) {
            $this->fail($exception->getMessage());
        }

        // User without permission.
        $user = $this->getDataGenerator()->create_user();
        $this->setUser($user);

        $userrole = $DB->get_field('role', 'id', ['shortname' => 'user']);
        unassign_capability('moodle/reportbuilder:view', $userrole, context_system::instance());

        $this->expectException(report_access_exception::class);
        $this->expectExceptionMessage('You can not view this report');
        permission::require_can_view_report($report);
    }

    /**
     * Test that user cannot edit system reports
     */
    public function test_require_can_edit_report_system_report(): void {
        global $CFG;
        require_once("{$CFG->dirroot}/reportbuilder/tests/fixtures/system_report_available.php");

        $this->resetAfterTest();
        $this->setAdminUser();

        $systemreport = system_report_factory::create(system_report_available::class, context_system::instance());

        $this->expectException(report_access_exception::class);
        $this->expectExceptionMessage('You can not edit this report');
        permission::require_can_edit_report($systemreport->get_report_persistent());
    }

    /**
     * Test that user can edit their own reports
     */
    public function test_require_can_edit_report_own(): void {
        global $DB;

        $this->resetAfterTest();

        $user = $this->getDataGenerator()->create_user();
        $this->setUser($user);

        $userrole = $DB->get_field('role', 'id', ['shortname' => 'user']);
        assign_capability('moodle/reportbuilder:edit', CAP_ALLOW, $userrole, context_system::instance());

        /** @var core_reportbuilder_generator $generator */
        $generator = $this->getDataGenerator()->get_plugin_generator('core_reportbuilder');
        $reportuser = $generator->create_report(['name' => 'User', 'source' => users::class]);
        $reportadmin = $generator->create_report(['name' => 'Admin', 'source' => users::class, 'usercreated' => get_admin()->id]);

        try {
            permission::require_can_edit_report($reportuser);
        } catch (Throwable $exception) {
            $this->fail($exception->getMessage());
        }

        $this->expectException(report_access_exception::class);
        $this->expectExceptionMessage('You can not edit this report');
        permission::require_can_edit_report($reportadmin);
    }

    /**
     * Test that user can edit any reports
     */
    public function test_require_can_edit_report_all(): void {
        $this->resetAfterTest();
        $this->setAdminUser();

        $user = $this->getDataGenerator()->create_user();

        /** @var core_reportbuilder_generator $generator */
        $generator = $this->getDataGenerator()->get_plugin_generator('core_reportbuilder');
        $reportuser = $generator->create_report(['name' => 'User', 'source' => users::class, 'usercreated' => $user->id]);
        $reportadmin = $generator->create_report(['name' => 'Admin', 'source' => users::class]);

        // User with permission.
        $this->setAdminUser();
        try {
            permission::require_can_edit_report($reportuser);
        } catch (Throwable $exception) {
            $this->fail($exception->getMessage());
        }

        // User without permission.
        $this->setUser($user);

        $this->expectException(report_access_exception::class);
        $this->expectExceptionMessage('You can not edit this report');
        permission::require_can_edit_report($reportadmin);
    }

    /**
     * Test that user can create a new report
     */
    public function test_require_can_create_report(): void {
        $this->resetAfterTest();

        // User has edit capability.
        $user = $this->getDataGenerator()->create_user();
        $this->setUser($user);

        $roleid = create_role('Dummy role', 'dummyrole', 'dummy role description');
        assign_capability('moodle/reportbuilder:edit', CAP_ALLOW, $roleid, context_system::instance());
        role_assign($roleid, $user->id, context_system::instance()->id);

        try {
            permission::require_can_create_report((int)$user->id);
        } catch (Throwable $exception) {
            $this->fail($exception->getMessage());
        }

        // User has editall capability.
        $user2 = $this->getDataGenerator()->create_user();
        $this->setUser($user2);

        $roleid2 = create_role('Dummy role 2', 'dummyrole2', 'dummy role 2 description');
        assign_capability('moodle/reportbuilder:editall', CAP_ALLOW, $roleid2, context_system::instance());
        role_assign($roleid2, $user2->id, context_system::instance()->id);

        try {
            permission::require_can_create_report((int)$user2->id);
        } catch (Throwable $exception) {
            $this->fail($exception->getMessage());
        }

        // User has no capability.
        $user3 = $this->getDataGenerator()->create_user();
        $this->setUser($user3);

        $this->expectException(report_access_exception::class);
        $this->expectExceptionMessage('You can not create a new report');
        permission::require_can_create_report((int)$user3->id);
    }
}
